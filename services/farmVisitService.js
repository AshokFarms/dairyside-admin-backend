// ============================================================
//  services/farmVisitService.js
//  Farm Visit administration: farm details, page content, bookable slots and
//  the bookings queue.
// ============================================================

const AdminFarmVisit = require('../models/adminFarmVisitModel');
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/pagination');
const logger = require('../utils/logger');

// Table names are interpolated into SQL, so they may only ever come from this
// map — never from a request. The key is what the URL exposes.
const SECTIONS = {
  blocks: 'farm_content_blocks',
  gallery: 'farm_gallery_items',
  testimonials: 'farm_testimonials',
  faqs: 'farm_faqs',
};

const BOOKING_SORTABLE = ['created_at', 'visit_date', 'status', 'seats'];

function sectionTable(section) {
  const table = SECTIONS[section];
  if (!table) throw new ApiError(404, `Unknown content section "${section}"`);
  return table;
}

// ── Shapers ─────────────────────────────────────────────────
// MySQL returns DECIMAL as a string and TINYINT(1) as 0/1; the admin UI wants
// numbers and booleans. Doing it here means no screen has to remember.
function shapeSlot(s) {
  return {
    id: s.id,
    farm_id: s.farm_id,
    visit_date: toYmd(s.visit_date),
    start_time: s.start_time,
    end_time: s.end_time,
    visit_type: s.visit_type,
    capacity: Number(s.capacity),
    seats_booked: Number(s.seats_booked),
    seats_available: Number(s.seats_available ?? s.capacity - s.seats_booked),
    price_per_adult: Number(s.price_per_adult),
    price_per_child: Number(s.price_per_child),
    is_free: Number(s.price_per_adult) === 0 && Number(s.price_per_child) === 0,
    status: s.status,
    notes: s.notes,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

function shapeBooking(b) {
  return {
    id: b.id,
    booking_ref: b.booking_ref,
    slot_id: b.slot_id,
    farm_id: b.farm_id,
    farm_name: b.farm_name,
    user_id: b.user_id,
    visitor_name: b.visitor_name,
    visitor_phone: b.visitor_phone,
    visitor_email: b.visitor_email,
    adults: Number(b.adults),
    children: Number(b.children),
    seats: Number(b.seats),
    status: b.status,
    special_requests: b.special_requests,
    amount_total: Number(b.amount_total),
    payment_status: b.payment_status,
    visit_date: toYmd(b.visit_date),
    start_time: b.start_time,
    end_time: b.end_time,
    visit_type: b.visit_type,
    cancelled_at: b.cancelled_at,
    created_at: b.created_at,
  };
}

function toYmd(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

// ── Farm ────────────────────────────────────────────────────
async function listFarms() {
  return (await AdminFarmVisit.listFarms()).map((f) => ({
    ...f,
    is_active: !!f.is_active,
    latitude: f.latitude != null ? Number(f.latitude) : null,
    longitude: f.longitude != null ? Number(f.longitude) : null,
  }));
}

async function getFarm(id) {
  const farm = await AdminFarmVisit.findFarm(id);
  if (!farm) throw new ApiError(404, 'Farm not found');
  return {
    ...farm,
    is_active: !!farm.is_active,
    latitude: farm.latitude != null ? Number(farm.latitude) : null,
    longitude: farm.longitude != null ? Number(farm.longitude) : null,
  };
}

async function updateFarm(id, body) {
  await getFarm(id); // 404s before we attempt the write
  await AdminFarmVisit.updateFarm(id, body);
  return getFarm(id);
}

// ── Content sections ────────────────────────────────────────
async function listSection(section, farmId) {
  const table = sectionTable(section);
  await getFarm(farmId);
  const rows = await AdminFarmVisit.listSection(table, farmId);
  return rows.map((r) => ({
    ...r,
    ...(r.is_active !== undefined ? { is_active: !!r.is_active } : {}),
    ...(r.is_published !== undefined ? { is_published: !!r.is_published } : {}),
  }));
}

/**
 * Columns each section cannot be created without.
 *
 * These are NOT NULL in the schema, so omitting one throws ER_BAD_NULL_ERROR
 * and surfaces as a 500 — an operator gets "something went wrong" for what is
 * really a missing field. Checked here so the answer is a 400 that names it.
 * alt_text in particular is NOT NULL on purpose: it is how the storefront
 * guarantees every published photo has alternative text.
 */
const REQUIRED_ON_CREATE = {
  farm_content_blocks: ['block_type', 'title'],
  farm_gallery_items: ['image_url', 'alt_text'],
  farm_testimonials: ['author_name', 'quote'],
  farm_faqs: ['question', 'answer'],
};

async function createSectionRow(section, farmId, body) {
  const table = sectionTable(section);
  await getFarm(farmId);

  // `alt_text: ''` is legitimate (a decorative photo), so only null/undefined
  // count as missing — an empty string is a deliberate choice.
  const missing = (REQUIRED_ON_CREATE[table] || []).filter(
    (col) => body[col] === undefined || body[col] === null
  );
  if (missing.length) {
    throw new ApiError(400, `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }

  const fields = { ...body, farm_id: farmId };
  // meta is a JSON column; mysql2 will not serialise a plain object for it.
  if (fields.meta && typeof fields.meta === 'object') fields.meta = JSON.stringify(fields.meta);

  const id = await AdminFarmVisit.createSectionRow(table, fields);
  return AdminFarmVisit.findSectionRow(table, id);
}

async function updateSectionRow(section, id, body) {
  const table = sectionTable(section);
  const existing = await AdminFarmVisit.findSectionRow(table, id);
  if (!existing) throw new ApiError(404, 'Content item not found');

  const fields = { ...body };
  if (fields.meta && typeof fields.meta === 'object') fields.meta = JSON.stringify(fields.meta);

  await AdminFarmVisit.updateSectionRow(table, id, fields);
  return AdminFarmVisit.findSectionRow(table, id);
}

async function deleteSectionRow(section, id) {
  const table = sectionTable(section);
  const affected = await AdminFarmVisit.deleteSectionRow(table, id);
  if (!affected) throw new ApiError(404, 'Content item not found');
  return { id: Number(id) };
}

// ── Slots ───────────────────────────────────────────────────
async function listSlots(farmId, query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'visit_date' });
  const { rows, total } = await AdminFarmVisit.listSlots({
    farmId,
    from: query.from,
    to: query.to,
    status: query.status,
    visitType: query.visit_type,
    limit,
    offset,
  });
  return { data: rows.map(shapeSlot), page, limit, total };
}

async function createSlot(farmId, body) {
  await getFarm(farmId);
  try {
    const id = await AdminFarmVisit.createSlot({ ...body, farm_id: farmId });
    return shapeSlot(await AdminFarmVisit.findSlot(id));
  } catch (err) {
    // uq_slot_occurrence — a slot for that date/time/type already exists.
    if (err.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'A slot already exists for that date, time and visit type');
    }
    throw err;
  }
}

/**
 * Update a slot.
 *
 * Capacity gets special handling: the chk_slot_seats CHECK constraint rejects
 * capacity < seats_booked with error 3819, which would otherwise surface as an
 * opaque 500. An admin trying to shrink a slot below what is already booked
 * needs to be told the actual number, so they can cancel bookings first.
 */
async function updateSlot(id, body) {
  const slot = await AdminFarmVisit.findSlot(id);
  if (!slot) throw new ApiError(404, 'Slot not found');

  if (body.capacity !== undefined && Number(body.capacity) < Number(slot.seats_booked)) {
    throw new ApiError(
      409,
      `Cannot reduce capacity to ${body.capacity} — ${slot.seats_booked} seat(s) are already booked. Cancel bookings first.`
    );
  }

  try {
    await AdminFarmVisit.updateSlot(id, body);
  } catch (err) {
    if (err.errno === 3819) {
      throw new ApiError(409, 'That change would leave the slot overbooked');
    }
    if (err.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'Another slot already occupies that date, time and visit type');
    }
    throw err;
  }
  return shapeSlot(await AdminFarmVisit.findSlot(id));
}

/**
 * Delete a slot.
 *
 * fk_booking_slot is ON DELETE RESTRICT, so a slot with bookings cannot be
 * deleted — deliberately. Wiping a slot would orphan people who are planning to
 * turn up. Suggest CANCELLED status instead, which keeps the bookings and lets
 * staff contact them.
 */
async function deleteSlot(id) {
  const slot = await AdminFarmVisit.findSlot(id);
  if (!slot) throw new ApiError(404, 'Slot not found');

  if (Number(slot.seats_booked) > 0) {
    throw new ApiError(
      409,
      `This slot has ${slot.seats_booked} booked seat(s). Set its status to CANCELLED instead of deleting it, so those visitors can be contacted.`
    );
  }

  try {
    await AdminFarmVisit.deleteSlot(id);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      throw new ApiError(409, 'This slot has bookings and cannot be deleted');
    }
    throw err;
  }
  return { id: Number(id) };
}

/**
 * Generate slots across a date range from a set of daily templates.
 *
 * Re-runnable: INSERT IGNORE against uq_slot_occurrence means overlapping a
 * previous generation tops up the missing days instead of failing, and never
 * disturbs a slot that already has bookings.
 */
async function bulkGenerateSlots(farmId, body) {
  await getFarm(farmId);

  const { from, to, templates, skip_weekdays = [] } = body;

  const rows = [];
  let cursor = from;
  let guard = 0;

  while (cursor <= to && guard++ < 400) {
    const weekday = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (!skip_weekdays.includes(weekday)) {
      for (const t of templates) {
        rows.push({
          farm_id: farmId,
          visit_date: cursor,
          start_time: t.start_time,
          end_time: t.end_time,
          visit_type: t.visit_type || 'GENERAL',
          capacity: t.capacity,
          price_per_adult: t.price_per_adult ?? 0,
          price_per_child: t.price_per_child ?? 0,
          status: 'OPEN',
        });
      }
    }
    cursor = addOneDay(cursor);
  }

  const created = await AdminFarmVisit.bulkCreateSlots(rows);
  logger.info?.('farmVisit.slots_generated', { farmId, attempted: rows.length, created });

  return {
    attempted: rows.length,
    created,
    // The difference is slots that already existed — worth surfacing so the
    // admin understands why "generate 60" reported 12.
    skipped_existing: rows.length - created,
  };
}

// UTC-anchored so stepping a day can never cross an offset boundary.
function addOneDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

// ── Bookings ────────────────────────────────────────────────
async function listBookings(query) {
  const { page, limit, offset, sortBy, sortOrder } = parsePagination(query, {
    sortable: BOOKING_SORTABLE,
    defaultSort: 'created_at',
    defaultOrder: 'DESC',
  });

  // Qualify the column: created_at/status/seats exist on both joined tables.
  const sortColumn = sortBy === 'visit_date' ? 's.visit_date' : `b.${sortBy}`;

  const { rows, total } = await AdminFarmVisit.listBookings({
    farmId: query.farm_id,
    status: query.status,
    from: query.from,
    to: query.to,
    search: query.search,
    limit,
    offset,
    sortBy: sortColumn,
    sortOrder,
  });

  return { data: rows.map(shapeBooking), page, limit, total };
}

async function getBooking(id) {
  const booking = await AdminFarmVisit.findBooking(id);
  if (!booking) throw new ApiError(404, 'Booking not found');
  return shapeBooking(booking);
}

/**
 * Change a booking's status.
 *
 * CANCELLED is routed through the transactional release so the seats go back;
 * every other transition leaves occupancy alone. Splitting these is the whole
 * point — a plain UPDATE to 'CANCELLED' would silently leak seats forever.
 */
async function updateBookingStatus(id, status) {
  const existing = await AdminFarmVisit.findBooking(id);
  if (!existing) throw new ApiError(404, 'Booking not found');

  if (status === 'CANCELLED') {
    const outcome = await AdminFarmVisit.cancelBookingAndRelease(id);
    if (outcome === 'not_found') throw new ApiError(404, 'Booking not found');
    if (outcome === 'not_modifiable') {
      throw new ApiError(409, `A ${existing.status.toLowerCase()} booking can no longer be cancelled`);
    }
    // 'already_cancelled' is not an error — cancelling twice is idempotent.
    return getBooking(id);
  }

  if (existing.status === 'CANCELLED') {
    throw new ApiError(409, 'This booking is cancelled. Its seats have been released and cannot be reclaimed automatically.');
  }

  await AdminFarmVisit.setBookingStatus(id, status);
  return getBooking(id);
}

async function bookingStats(farmId) {
  const rows = await AdminFarmVisit.bookingStats(farmId);
  const stats = { total: 0, seats: 0, by_status: {} };
  for (const r of rows) {
    stats.by_status[r.status] = { count: Number(r.n), seats: Number(r.seats) };
    stats.total += Number(r.n);
    // Cancelled bookings hold no seats, so they must not inflate the headcount.
    if (r.status !== 'CANCELLED') stats.seats += Number(r.seats);
  }
  return stats;
}

module.exports = {
  listFarms, getFarm, updateFarm,
  listSection, createSectionRow, updateSectionRow, deleteSectionRow,
  listSlots, createSlot, updateSlot, deleteSlot, bulkGenerateSlots,
  listBookings, getBooking, updateBookingStatus, bookingStats,
  SECTIONS,
};
