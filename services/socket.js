// ============================================================
//  services/socket.js
//  Real-time feed for the admin panel.
//
//  Unlike the customer socket, this one has NO anonymous mode. Every payload
//  here is operational data (order values, stock positions), so an unverified
//  handshake is REJECTED rather than downgraded to a guest connection. Identity
//  comes from the same session cookie the REST routes use — a socket is not a
//  side door around adminGuard.
//
//  Every authorised admin joins one room, `admins`. There is no per-admin
//  routing to do: they are all looking at the same operational picture.
//
//  Events (server → client):
//    'order:new'  { orderId, status, totalAmount, paymentMethod, createdAt }
//    'stock:low'  { productVariantId, stock, lowStock, state }
// ============================================================

const { Server } = require('socket.io');
const config = require('../config/env');
const auth = require('./adminAuth.service');
const logger = require('../utils/logger');

let io = null;
const ADMIN_ROOM = 'admins';

// The handshake carries a raw Cookie header — no cookie-parser in this path.
function readCookie(rawHeader, name) {
  if (!rawHeader) return null;
  for (const part of String(rawHeader).split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim()) || null;
    } catch {
      return part.slice(eq + 1).trim() || null;
    }
  }
  return null;
}

async function requireAdmin(socket, next) {
  // Mirror the REST posture exactly: when auth is disabled the whole admin API
  // is already open, so refusing sockets here would buy nothing while making
  // the panel look broken. When it is enabled, the socket is closed too.
  if (!config.auth.enabled) {
    socket.data.admin = { uid: 'admin:open', mode: 'open' };
    return next();
  }

  const cookie = readCookie(socket.handshake.headers?.cookie, auth.COOKIE_NAME);
  const admin = await auth.verifySession(cookie);
  if (!admin) return next(new Error('unauthorized'));

  socket.data.admin = { uid: admin.uid, email: admin.email, mode: 'enforced' };
  return next();
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.corsOrigins, credentials: true, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 1e5,
  });

  io.use((socket, next) => requireAdmin(socket, next).catch(() => next(new Error('unauthorized'))));

  io.on('connection', (socket) => {
    socket.join(ADMIN_ROOM);
    logger.info('admin.socket_connected', { uid: socket.data.admin?.uid });
  });

  logger.info('socket.initialised', { detail: 'admin real-time feed enabled' });
  return io;
}

/** Fire-and-forget push to every connected admin. Never throws. */
function emitToAdmins(event, payload) {
  if (!io) return;
  try {
    io.to(ADMIN_ROOM).emit(event, payload);
  } catch (err) {
    logger.warn('admin.socket_emit_failed', { event, message: err.message });
  }
}

module.exports = { initSocket, emitToAdmins, getIO: () => io, ADMIN_ROOM };
