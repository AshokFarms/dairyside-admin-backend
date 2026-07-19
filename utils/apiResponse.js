// Consistent response envelope across every admin endpoint.
// Success: { success: true, data, [pagination] }
// Error:   { success: false, error }  (produced by the error handler)
// This shape is backward-compatible with the wired admin frontend, which reads
// `response.data.data`.

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function created(res, data) {
  return res.status(201).json({ success: true, data });
}

/**
 * List response with pagination metadata.
 * @param {object} page - { data, page, limit, total }
 */
function paginated(res, { data, page, limit, total }) {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  });
}

module.exports = { ok, created, paginated };
