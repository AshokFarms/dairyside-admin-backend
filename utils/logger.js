// Advanced structured logger with pretty terminal printing and JSON support.
const config = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

// Format configuration
// Read format from LOG_FORMAT (pretty or json), default to pretty in development
const isDev = process.env.NODE_ENV !== 'production';
const format = process.env.LOG_FORMAT || (isDev ? 'pretty' : 'json');
const logFilter = process.env.LOG_FILTER || '';

// ANSI Colors
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// In-memory buffer for request-bound logs
const requestBuffers = new Map();

function colorize(color, text) {
  if (!text) return '';
  return `${C[color]}${text}${C.reset}`;
}

function shouldLog(reqId, moduleName) {
  if (!logFilter) return true;
  if (logFilter.startsWith('request:')) {
    return reqId === logFilter.split(':')[1];
  }
  return logFilter === 'request' || logFilter === moduleName || logFilter === 'all';
}

function formatPrettyCompact(reqId, buffer) {
  // Find the request.completed log which has the status and duration
  const endLog = buffer.find(b => b.msg === 'request.completed');
  if (!endLog) return ''; // Incomplete or aborted

  const method = endLog.method || 'GET';
  const path = endLog.path || '/';
  const status = endLog.detail?.status || 200;
  const durationMs = endLog.detail?.durationMs || 0;

  let statusColor = status >= 500 ? 'red' : status >= 400 ? 'yellow' : 'green';
  let durationColor = durationMs > 500 ? 'yellow' : 'gray';
  
  let icon = status >= 400 ? colorize('red', '✗') : durationMs > 500 ? colorize('yellow', '⚠') : colorize('green', '✓');

  return `${icon} ${colorize('bold', method)} ${path.padEnd(30, ' ')} ............ ${colorize(statusColor, status)} (${colorize(durationColor, durationMs + 'ms')})`;
}

function formatPrettyExpanded(reqId, buffer) {
  if (!buffer.length) return '';
  
  const startLog = buffer[0];
  const endLog = buffer.find(b => b.msg === 'request.completed');
  const errors = buffer.filter(b => b.level === 'error');
  
  const method = startLog.method || endLog?.method || 'UNK';
  const path = startLog.path || endLog?.path || '/';
  const status = endLog?.detail?.status || 200;
  const durationMs = endLog?.detail?.durationMs || '?';
  
  const statusColor = status >= 500 ? 'red' : status >= 400 ? 'yellow' : 'green';
  const hasError = errors.length > 0;
  
  let out = `\n${C.gray}────────────────────────────────────────────────────────────${C.reset}\n`;
  out += `${colorize('bold', method)} ${path}          ${colorize(statusColor, colorize('bold', status))}         ${durationMs}ms\n`;
  out += `${C.gray}Request ID: ${reqId}${C.reset}\n\n`;

  // Request section
  out += `${colorize('blue', 'Request')}\n`;
  out += `  Method      ${method}\n`;
  out += `  Path        ${path}\n`;
  
  // Categorize logs
  const dbLogs = buffer.filter(b => b.msg.startsWith('db.'));
  const otherLogs = buffer.filter(b => !['request.completed'].includes(b.msg) && !b.msg.startsWith('db.') && b.level !== 'error' && b !== startLog);
  
  if (otherLogs.length) {
    out += `\n${colorize('cyan', 'Timeline')}\n`;
    for (const log of otherLogs) {
      out += `  ${C.gray}✓${C.reset} ${log.msg} ${log.detail ? C.gray + JSON.stringify(log.detail) + C.reset : ''}\n`;
    }
  }

  if (dbLogs.length) {
    out += `\n${colorize('magenta', 'Database')}\n`;
    for (const log of dbLogs) {
      if (log.msg === 'db.query') {
        out += `  ${C.gray}Query${C.reset}       ${log.detail?.sql || '...'}\n`;
      } else {
        out += `  ${C.gray}${log.msg}${C.reset} ${log.detail ? JSON.stringify(log.detail) : ''}\n`;
      }
    }
  }
  
  if (hasError) {
    out += `\n${colorize('red', colorize('bold', '✗ ERROR'))}\n`;
    for (const err of errors) {
      out += `  Message     ${err.msg}\n`;
      if (err.detail?.message) out += `  Detail      ${err.detail.message}\n`;
    }
  }

  out += `\n${colorize('green', 'Response')}\n`;
  out += `  Status      ${colorize(statusColor, status)}\n`;
  out += `  Duration    ${durationMs}ms\n`;
  out += `${C.gray}────────────────────────────────────────────────────────────${C.reset}\n`;

  return out;
}

function printLog(entry) {
  if (format === 'json') {
    const stream = (entry.level === 'error' || entry.level === 'warn') ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(entry)}\n`);
    return;
  }
  
  // Pretty print single log (not bound to a request)
  let color = entry.level === 'error' ? 'red' : entry.level === 'warn' ? 'yellow' : 'cyan';
  let line = `${colorize('gray', entry.ts.split('T')[1].replace('Z', ''))} ${colorize(color, entry.level.toUpperCase().padEnd(5))} ${colorize('bold', entry.msg)}`;
  if (entry.detail && Object.keys(entry.detail).length > 0) {
    line += ` ${C.gray}${JSON.stringify(entry.detail)}${C.reset}`;
  }
  console.log(line);
}

function emit(level, message, meta) {
  if (LEVELS[level] > threshold) return;
  
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta && typeof meta === 'object' ? meta : meta !== undefined ? { detail: meta } : {}),
  };

  const reqId = entry.requestId;
  
  if (format === 'pretty' && reqId) {
    if (!requestBuffers.has(reqId)) {
      requestBuffers.set(reqId, []);
    }
    requestBuffers.get(reqId).push(entry);
  } else {
    printLog(entry);
  }
}

const logger = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
  trace: (msg, meta) => emit('trace', msg, meta),
  
  /** Return a logger bound to a request's correlation id + method/path. */
  child: (ctx) => ({
    error: (msg, meta) => emit('error', msg, { ...ctx, ...meta }),
    warn: (msg, meta) => emit('warn', msg, { ...ctx, ...meta }),
    info: (msg, meta) => emit('info', msg, { ...ctx, ...meta }),
    debug: (msg, meta) => emit('debug', msg, { ...ctx, ...meta }),
    trace: (msg, meta) => emit('trace', msg, { ...ctx, ...meta }),
  }),
  
  /** Flush buffered logs for a request */
  flush: (reqId) => {
    if (format !== 'pretty' || !reqId) return;
    
    const buffer = requestBuffers.get(reqId);
    if (!buffer) return;
    
    requestBuffers.delete(reqId);
    
    if (!shouldLog(reqId, 'request')) return;
    
    const hasError = buffer.some(b => b.level === 'error');
    const isVerbose = logFilter.startsWith('request:') || logFilter === 'all';
    
    // Print expanded mode if there's an error, or if explicitly filtered, otherwise print compact line
    if (hasError || isVerbose) {
      console.log(formatPrettyExpanded(reqId, buffer));
    } else {
      console.log(formatPrettyCompact(reqId, buffer));
    }
  }
};

module.exports = logger;
