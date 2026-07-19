const AdminPincode = require('../models/adminPincodeModel');
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/pagination');

// UI shows delivery_fee / min_order_amount / morning / evening, which have no
// backing columns yet. Surface safe defaults so the table renders; persisting
// them needs the ALTER in the DDL handoff.
function shape(p) {
  return {
    id: p.id,
    pincode: p.pincode,
    area_name: p.area_name,
    city: p.city,
    state: p.state,
    is_active: !!p.is_active,
    launching_on: p.launching_on,
    delivery_fee: 0,
    min_order_amount: 0,
    morning: true,
    evening: true,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

async function list(query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'pincode' });
  const { rows, total } = await AdminPincode.list({
    isActive: query.is_active,
    search: query.search,
    limit,
    offset,
  });
  return { data: rows.map(shape), page, limit, total };
}

async function create(body) {
  const id = await AdminPincode.create(body);
  return shape(await AdminPincode.findById(id));
}

async function update(id, body) {
  const existing = await AdminPincode.findById(id);
  if (!existing) throw new ApiError(404, 'Pincode not found');
  await AdminPincode.update(id, body);
  return shape(await AdminPincode.findById(id));
}

async function remove(id) {
  const affected = await AdminPincode.remove(id);
  if (!affected) throw new ApiError(404, 'Pincode not found');
  return { id: Number(id) };
}

module.exports = { list, create, update, remove };
