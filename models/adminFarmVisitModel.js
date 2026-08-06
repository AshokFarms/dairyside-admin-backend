// ============================================================
//  models/adminFarmVisitModel.js
//  Data access for the Farm Visit tables (migration 018, customer backend).
//
//  SHARED-DB WARNING
//  These tables are written by the CUSTOMER backend too, which owns the booking
//  path. The invariant both processes must respect:
//
//      farm_visit_slots.seats_booked is only ever moved by an atomic
//      conditional UPDATE, never by read-then-write.
//
//  Claim:   WHERE seats_booked + :n <= capacity
//  Release: WHERE seats_booked >= :n        <-- NOT `seats_booked - :n >= 0`
//
//  seats_booked is INT UNSIGNED and the server runs STRICT_ALL_TABLES, so the
//  subtraction form underflows and raises ER_DATA_OUT_OF_RANGE (1690) instead
//  of matching 0 rows. That turns an idempotent double-cancel into a 500.
//  See the customer repo's services/farmVisitBooking.service.js — the two
//  implementations must not drift.
// ============================================================

const pool = require('../config/database');

const AdminFarmVisit = {
  // ── Farm ──────────────────────────────────────────────────
  listFarms: async () => {
    const [rows] = await pool.query(
      'SELECT * FROM farms ORDER BY display_order ASC, id ASC'
    );
    return rows;
  },

  findFarm: async (id) => {
    const [rows] = await pool.query('SELECT * FROM farms WHERE id = ?', [id]);
    return rows[0] || null;
  },

  updateFarm: async (id, fields) => {
    const [result] = await pool.query('UPDATE farms SET ? WHERE id = ?', [fields, id]);
    return result.affectedRows;
  },

  // ── Generic content sections ──────────────────────────────
  // blocks / gallery / testimonials / faqs are all "ordered rows owned by a
  // farm". One set of helpers rather than four near-identical copies; the
  // table name is never user input (see ALLOWED_TABLES in the service).
  listSection: async (table, farmId, { includeUnpublished = true } = {}) => {
    const flag = table === 'farm_content_blocks' ? 'is_active' : 'is_published';
    const where = [];
    const params = [];

    // farm_faqs allows NULL farm_id (a global FAQ), so match those too.
    if (table === 'farm_faqs') {
      where.push('(farm_id = ? OR farm_id IS NULL)');
      params.push(farmId);
    } else {
      where.push('farm_id = ?');
      params.push(farmId);
    }
    if (!includeUnpublished) where.push(`${flag} = 1`);

    const [rows] = await pool.query(
      `SELECT * FROM ${table} WHERE ${where.join(' AND ')} ORDER BY display_order ASC, id ASC`,
      params
    );
    return rows;
  },

  findSectionRow: async (table, id) => {
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    return rows[0] || null;
  },

  createSectionRow: async (table, fields) => {
    const [result] = await pool.query(`INSERT INTO ${table} SET ?`, [fields]);
    return result.insertId;
  },

  updateSectionRow: async (table, id, fields) => {
    const [result] = await pool.query(`UPDATE ${table} SET ? WHERE id = ?`, [fields, id]);
    return result.affectedRows;
  },

  deleteSectionRow: async (table, id) => {
    const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return result.affectedRows;
  },

  // ── Slots ─────────────────────────────────────────────────
  listSlots: async ({ farmId, from, to, status, visitType, limit, offset }) => {
    const where = ['s.farm_id = ?'];
    const params = [farmId];

    if (from) { where.push('s.visit_date >= ?'); params.push(from); }
    if (to) { where.push('s.visit_date <= ?'); params.push(to); }
    if (status) { where.push('s.status = ?'); params.push(status); }
    if (visitType) { where.push('s.visit_type = ?'); params.push(visitType); }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT s.*, (s.capacity - s.seats_booked) AS seats_available
         FROM farm_visit_slots s
         ${whereSql}
        ORDER BY s.visit_date ASC, s.start_time ASC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM farm_visit_slots s ${whereSql}`,
      params
    );
    return { rows, total: countRows[0].total };
  },

  findSlot: async (id) => {
    const [rows] = await pool.query(
      `SELECT *, (capacity - seats_booked) AS seats_available
         FROM farm_visit_slots WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  createSlot: async (fields) => {
    const [result] = await pool.query('INSERT INTO farm_visit_slots SET ?', [fields]);
    return result.insertId;
  },

  updateSlot: async (id, fields) => {
    const [result] = await pool.query('UPDATE farm_visit_slots SET ? WHERE id = ?', [fields, id]);
    return result.affectedRows;
  },

  deleteSlot: async (id) => {
    const [result] = await pool.query('DELETE FROM farm_visit_slots WHERE id = ?', [id]);
    return result.affectedRows;
  },

  /**
   * Bulk-create slots. INSERT IGNORE against uq_slot_occurrence, so re-running
   * a generation over an overlapping range tops it up instead of erroring or
   * duplicating — the admin can safely hit "generate" twice.
   */
  bulkCreateSlots: async (rows) => {
    if (!rows.length) return 0;
    const [result] = await pool.query(
      `INSERT IGNORE INTO farm_visit_slots
         (farm_id, visit_date, start_time, end_time, visit_type, capacity,
          price_per_adult, price_per_child, status)
       VALUES ?`,
      [rows.map((r) => [
        r.farm_id, r.visit_date, r.start_time, r.end_time, r.visit_type,
        r.capacity, r.price_per_adult, r.price_per_child, r.status,
      ])]
    );
    return result.affectedRows;
  },

  // ── Bookings ──────────────────────────────────────────────
  listBookings: async ({ farmId, status, from, to, search, limit, offset, sortBy, sortOrder }) => {
    const where = [];
    const params = [];

    if (farmId) { where.push('b.farm_id = ?'); params.push(farmId); }
    if (status) { where.push('b.status = ?'); params.push(status); }
    if (from) { where.push('s.visit_date >= ?'); params.push(from); }
    if (to) { where.push('s.visit_date <= ?'); params.push(to); }
    if (search) {
      where.push('(b.booking_ref LIKE ? OR b.visitor_name LIKE ? OR b.visitor_phone LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    // sortBy is whitelisted by parsePagination before it reaches here.
    const orderSql = `ORDER BY ${sortBy} ${sortOrder}`;

    const [rows] = await pool.query(
      `SELECT b.*, s.visit_date, s.start_time, s.end_time, s.visit_type,
              f.name AS farm_name
         FROM farm_visit_bookings b
         JOIN farm_visit_slots s ON s.id = b.slot_id
         JOIN farms f            ON f.id = b.farm_id
         ${whereSql}
         ${orderSql}
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM farm_visit_bookings b
         JOIN farm_visit_slots s ON s.id = b.slot_id
         ${whereSql}`,
      params
    );
    return { rows, total: countRows[0].total };
  },

  findBooking: async (id) => {
    const [rows] = await pool.query(
      `SELECT b.*, s.visit_date, s.start_time, s.end_time, s.visit_type, f.name AS farm_name
         FROM farm_visit_bookings b
         JOIN farm_visit_slots s ON s.id = b.slot_id
         JOIN farms f            ON f.id = b.farm_id
        WHERE b.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  findBookingsByIds: async (ids) => {
    if (!ids.length) return [];
    const [rows] = await pool.query(
      `SELECT b.id, b.booking_ref, b.visitor_name, b.seats, b.status, b.created_at,
              s.visit_date, s.start_time, f.name AS farm_name
         FROM farm_visit_bookings b
         JOIN farm_visit_slots s ON s.id = b.slot_id
         JOIN farms f            ON f.id = b.farm_id
        WHERE b.id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    return rows;
  },

  /**
   * Cancel a booking and release its seats, atomically.
   *
   * Both statements run in ONE transaction so seats and status can never
   * disagree. The status guard makes it idempotent: a second cancel matches 0
   * rows and releases nothing.
   *
   * @returns {'cancelled'|'already_cancelled'}
   */
  cancelBookingAndRelease: async (bookingId) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        'SELECT id, slot_id, seats, status FROM farm_visit_bookings WHERE id = ? FOR UPDATE',
        [bookingId]
      );
      const booking = rows[0];
      if (!booking) {
        await conn.rollback();
        return 'not_found';
      }
      if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
        await conn.rollback();
        return booking.status === 'CANCELLED' ? 'already_cancelled' : 'not_modifiable';
      }

      const [upd] = await conn.query(
        `UPDATE farm_visit_bookings
            SET status = 'CANCELLED', cancelled_at = NOW(3)
          WHERE id = ? AND status IN ('PENDING','CONFIRMED')`,
        [bookingId]
      );

      if (upd.affectedRows === 1) {
        // `>=`, never `- n >= 0` — see the header note on INT UNSIGNED.
        await conn.query(
          `UPDATE farm_visit_slots
              SET seats_booked = seats_booked - ?
            WHERE id = ? AND seats_booked >= ?`,
          [booking.seats, booking.slot_id, booking.seats]
        );
      }

      await conn.commit();
      return 'cancelled';
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  },

  /**
   * Set a booking's status WITHOUT touching seats.
   * Only for transitions that don't change occupancy (CONFIRMED / COMPLETED /
   * NO_SHOW). Cancellation must go through cancelBookingAndRelease so the seats
   * come back.
   */
  setBookingStatus: async (bookingId, status) => {
    const [result] = await pool.query(
      `UPDATE farm_visit_bookings SET status = ?
        WHERE id = ? AND status NOT IN ('CANCELLED')`,
      [status, bookingId]
    );
    return result.affectedRows;
  },

  /** Booking counts by status, for the admin list's summary chips. */
  bookingStats: async (farmId) => {
    const [rows] = await pool.query(
      `SELECT status, COUNT(*) AS n, COALESCE(SUM(seats), 0) AS seats
         FROM farm_visit_bookings
        WHERE farm_id = ?
        GROUP BY status`,
      [farmId]
    );
    return rows;
  },
};

module.exports = AdminFarmVisit;
