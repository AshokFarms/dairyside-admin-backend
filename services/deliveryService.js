const AdminDelivery = require('../models/adminDeliveryModel');
const { ApiError } = require('../middleware/errorHandler');
const { istDateString } = require('../utils/dates');
const { formatOrderNumber } = require('../utils/orderNumber');

function addressLine(o) {
  return [o.flat_no, o.street_name, o.area].filter(Boolean).join(', ') || null;
}

async function getToday(query) {
  const date = query.date ? String(query.date).slice(0, 10) : istDateString();
  const rows = await AdminDelivery.forDate({ date, shift: query.shift });

  const deliveries = rows.map((o) => ({
    id: o.id,
    order_number: formatOrderNumber(o.id, o.delivery_date),
    customer: o.customer,
    phone: o.phone || o.address_phone || null,
    items: [o.product_name, o.size_label].filter(Boolean).join(' '),
    quantity: Number(o.quantity || 0),
    shift: o.shift,
    status: o.status,
    address: addressLine(o),
    pincode: o.pincode || null,
    delivery_date: o.delivery_date,
  }));

  const summary = {
    total: deliveries.length,
    morning: deliveries.filter((d) => d.shift === 'morning').length,
    evening: deliveries.filter((d) => d.shift === 'evening').length,
    pending: deliveries.filter((d) => d.status !== 'delivered' && d.status !== 'cancelled').length,
    delivered: deliveries.filter((d) => d.status === 'delivered').length,
  };

  return { date, summary, deliveries };
}

async function complete(orderId) {
  const result = await AdminDelivery.complete(orderId);
  if (!result.found) throw new ApiError(404, 'Order not found');
  return { id: result.id, status: result.status };
}

async function bulkComplete(ids) {
  const updated = await AdminDelivery.bulkComplete(ids);
  return { completed: updated };
}

module.exports = { getToday, complete, bulkComplete };
