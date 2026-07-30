// Gate for /v1/admin/internal/* — the process-to-process bridge the CUSTOMER
// backend uses to reach this API's socket layer. Not reachable by browsers (the
// secret never ships to a client), and deliberately mounted outside adminGuard
// because the caller is a server, not a signed-in admin.
//
// Fails CLOSED: with no INTERNAL_STOCK_SECRET set, the route is dead rather than
// open, so a missing env var can never turn it into a public broadcast endpoint.
module.exports = function internalSecret(req, res, next) {
  const secret = process.env.INTERNAL_STOCK_SECRET;
  if (!secret || req.get('x-internal-secret') !== secret) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  return next();
};
