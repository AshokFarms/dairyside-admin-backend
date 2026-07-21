const AdminAudit = require('../models/adminAuditModel');
const { parsePagination } = require('../utils/pagination');

// The `changes` column is JSON; mysql2 already parses it. Normalise defensively
// so the UI always receives an array of {field, old, new}.
function parseChanges(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function shape(r) {
  return {
    id: r.id,
    created_at: r.created_at, // UTC — the UI renders in Asia/Kolkata
    source: r.source,
    actor: {
      id: r.actor_id,
      name: r.actor_name,
      contact: r.actor_contact,
      role: r.actor_role,
    },
    action: r.action,
    entity: { type: r.entity_type, id: r.entity_id },
    changes: parseChanges(r.changes),
    summary: r.summary,
    success: !!r.success,
    context: { ip: r.ip, user_agent: r.user_agent, request_id: r.request_id },
  };
}

async function list(query) {
  const { page, limit, offset, sortOrder } = parsePagination(query, {
    sortable: ['created_at'],
    defaultSort: 'created_at',
  });
  const filters = {
    actor: query.actor,
    action: query.action,
    entityType: query.entityType,
    entityId: query.entityId,
    source: query.source,
    success: query.success,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    search: query.search,
  };
  const { rows, total } = await AdminAudit.list({ filters, sortOrder, limit, offset });
  return { data: rows.map(shape), page, limit, total };
}

async function entityHistory(entityType, entityId, query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'created_at' });
  const { rows, total } = await AdminAudit.entityHistory({ entityType, entityId, limit, offset });
  return { data: rows.map(shape), page, limit, total };
}

async function facets() {
  return AdminAudit.facets();
}

/**
 * Delete audit entries — by explicit ids, or everything older than N days.
 * The actor and request context come from the server, never the request body.
 */
async function remove({ ids, olderThanDays }, req) {
  const actor = {
    id: req.admin?.uid || 'admin',
    name: req.admin?.uid ? `Admin ${req.admin.uid}` : 'Admin',
  };
  const context = {
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null,
    userAgent: req.headers['user-agent'] || null,
    requestId: req.requestId || null,
  };
  return AdminAudit.remove({ ids, olderThanDays, actor, context });
}

async function previewDelete({ ids, olderThanDays }) {
  return { count: await AdminAudit.countForDelete({ ids, olderThanDays }) };
}

module.exports = { list, entityHistory, facets, remove, previewDelete, shape };
