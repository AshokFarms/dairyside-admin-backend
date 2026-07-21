// Data access for the audit trail.
//
// Entries are written solely by the customer backend and can NEVER be edited —
// trg_audit_logs_no_update rejects every UPDATE unconditionally, so a recorded
// event cannot be silently rewritten.
//
// Deletion is the one mutation admins may perform (explicitly authorised).
// trg_audit_logs_no_delete still blocks every DELETE unless the session sets
// @allow_audit_purge = 1, which happens only inside `remove()` below and is
// reset immediately after — so a bug elsewhere in the API still cannot erase
// history. Every deletion writes an AUDIT_DELETE entry of its own, so the trail
// records its own pruning.
const pool = require('../config/database');

// Joi coerces ISO date strings into Date objects, so accept both forms.
const toDay = (d) =>
  d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

// created_at is stored in UTC, but admins filter by IST calendar dates.
// One IST day D spans UTC [D-1 18:30:00, D 18:29:59.999] (IST = UTC+5:30, no DST).
// Converting here keeps "21 July" meaning 21 July *in India*.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDayStartUtc = (d) =>
  new Date(new Date(`${toDay(d)}T00:00:00.000Z`).getTime() - IST_OFFSET_MS)
    .toISOString().slice(0, 19).replace('T', ' ');
const istDayEndUtc = (d) =>
  new Date(new Date(`${toDay(d)}T23:59:59.999Z`).getTime() - IST_OFFSET_MS)
    .toISOString().slice(0, 19).replace('T', ' ');

function buildFilters(f = {}) {
  const clauses = [];
  const params = [];

  if (f.actor) {
    // Match by uid, name or contact so admins can search "Ashok" or a uid.
    clauses.push('(a.actor_id = ? OR a.actor_name LIKE ? OR a.actor_contact LIKE ?)');
    params.push(f.actor, `%${f.actor}%`, `%${f.actor}%`);
  }
  if (f.action) {
    clauses.push('a.action = ?');
    params.push(f.action);
  }
  if (f.entityType) {
    clauses.push('a.entity_type = ?');
    params.push(f.entityType);
  }
  if (f.entityId) {
    clauses.push('a.entity_id = ?');
    params.push(String(f.entityId));
  }
  if (f.source) {
    clauses.push('a.source = ?');
    params.push(f.source);
  }
  if (f.success !== undefined) {
    clauses.push('a.success = ?');
    params.push(f.success ? 1 : 0);
  }
  if (f.dateFrom) {
    clauses.push('a.created_at >= ?');
    params.push(istDayStartUtc(f.dateFrom));
  }
  if (f.dateTo) {
    clauses.push('a.created_at <= ?');
    params.push(istDayEndUtc(f.dateTo));
  }
  if (f.search) {
    clauses.push('(a.summary LIKE ? OR a.entity_id LIKE ?)');
    params.push(`%${f.search}%`, `%${f.search}%`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const AdminAudit = {
  list: async ({ filters, sortOrder = 'DESC', limit, offset }) => {
    const { where, params } = buildFilters(filters);
    const [rows] = await pool.query(
      `SELECT a.id, a.created_at, a.source, a.actor_id, a.actor_name, a.actor_contact,
              a.actor_role, a.action, a.entity_type, a.entity_id, a.changes,
              a.summary, a.success, a.ip, a.user_agent, a.request_id
       FROM audit_logs a
       ${where}
       ORDER BY a.created_at ${sortOrder}, a.id ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs a ${where}`, params);
    return { rows, total: countRows[0].total };
  },

  /** Full chronological history for one record (oldest → newest reads best). */
  entityHistory: async ({ entityType, entityId, limit, offset }) => {
    const [rows] = await pool.query(
      `SELECT a.id, a.created_at, a.source, a.actor_id, a.actor_name, a.actor_contact,
              a.actor_role, a.action, a.entity_type, a.entity_id, a.changes,
              a.summary, a.success, a.ip, a.user_agent, a.request_id
       FROM audit_logs a
       WHERE a.entity_type = ? AND a.entity_id = ?
       ORDER BY a.created_at ASC, a.id ASC
       LIMIT ? OFFSET ?`,
      [entityType, String(entityId), limit, offset]
    );
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM audit_logs WHERE entity_type = ? AND entity_id = ?',
      [entityType, String(entityId)]
    );
    return { rows, total: countRows[0].total };
  },

  /** How many rows a given delete request would remove (for the confirm dialog). */
  countForDelete: async ({ ids, olderThanDays }) => {
    if (Array.isArray(ids) && ids.length) {
      const [rows] = await pool.query('SELECT COUNT(*) AS n FROM audit_logs WHERE id IN (?)', [ids]);
      return Number(rows[0].n);
    }
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS n FROM audit_logs WHERE created_at < (UTC_TIMESTAMP() - INTERVAL ? DAY)',
      [olderThanDays]
    );
    return Number(rows[0].n);
  },

  /**
   * Delete audit entries. Either an explicit list of ids, or everything older
   * than N days — never both, and never an unbounded "delete all".
   *
   * @allow_audit_purge is a SESSION variable, so the grant and the DELETE must
   * run on the SAME pooled connection; it is cleared again before the
   * connection goes back to the pool.
   */
  remove: async ({ ids, olderThanDays, actor = {}, context = {} }) => {
    const connection = await pool.getConnection();
    try {
      await connection.query('SET @allow_audit_purge = 1');

      let deleted = 0;
      let summary;

      if (Array.isArray(ids) && ids.length) {
        const [res] = await connection.query('DELETE FROM audit_logs WHERE id IN (?)', [ids]);
        deleted = res.affectedRows;
        summary = `Deleted ${deleted} audit entr${deleted === 1 ? 'y' : 'ies'} by id`;
      } else {
        // Batched so pruning a large backlog never holds a long lock on a table
        // the customer app is actively writing to.
        for (;;) {
          const [res] = await connection.query(
            'DELETE FROM audit_logs WHERE created_at < (UTC_TIMESTAMP() - INTERVAL ? DAY) LIMIT 1000',
            [olderThanDays]
          );
          if (!res.affectedRows) break;
          deleted += res.affectedRows;
        }
        summary = `Deleted ${deleted} audit entr${deleted === 1 ? 'y' : 'ies'} older than ${olderThanDays} days`;
      }

      // The deletion is itself an auditable event. INSERT is unaffected by the
      // triggers, so this record survives on the same connection.
      if (deleted > 0) {
        await connection.query(
          `INSERT INTO audit_logs
             (source, actor_id, actor_name, actor_role, action, entity_type, entity_id,
              changes, summary, success, ip, user_agent, request_id)
           VALUES ('admin-panel', ?, ?, 'ADMIN', 'AUDIT_DELETE', 'AuditLog', NULL, ?, ?, 1, ?, ?, ?)`,
          [
            actor.id || 'admin',
            actor.name || 'Admin',
            JSON.stringify(
              Array.isArray(ids) && ids.length
                ? [{ field: 'deleted_ids', old: ids.join(','), new: null }]
                : [{ field: 'older_than_days', old: null, new: olderThanDays }]
            ),
            summary,
            context.ip || null,
            (context.userAgent || '').slice(0, 255) || null,
            context.requestId || null,
          ]
        );
      }

      return { deleted };
    } finally {
      try {
        await connection.query('SET @allow_audit_purge = 0');
      } catch {
        /* connection may already be broken */
      }
      connection.release();
    }
  },

  /** Distinct values that actually exist — drives the UI filter dropdowns. */
  facets: async () => {
    const [actions] = await pool.query(
      'SELECT action, COUNT(*) AS n FROM audit_logs GROUP BY action ORDER BY n DESC'
    );
    const [entityTypes] = await pool.query(
      'SELECT entity_type FROM audit_logs WHERE entity_type IS NOT NULL GROUP BY entity_type ORDER BY entity_type'
    );
    const [sources] = await pool.query('SELECT source FROM audit_logs GROUP BY source ORDER BY source');
    return {
      actions: actions.map((r) => ({ value: r.action, count: Number(r.n) })),
      entityTypes: entityTypes.map((r) => r.entity_type),
      sources: sources.map((r) => r.source),
    };
  },
};

module.exports = AdminAudit;
