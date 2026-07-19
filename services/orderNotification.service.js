// "Your order was delivered" email — sent when ops marks an order delivered.
// ONE-TIME orders only: subscription rounds happen daily and would spam inboxes
// (subscribers get a month-end bill email instead). Fire-and-forget: never
// throws, never blocks the admin action.
const pool = require('../config/database');
const mailer = require('../utils/brevoMailer');
const logger = require('../utils/logger');
const { formatOrderNumber } = require('../utils/orderNumber');

const C = 'COLLATE utf8mb4_unicode_ci';
const SITE_URL = process.env.FRONTEND_URL || 'https://dairyside.in';
// Brand logo on Cloudinary; f_png,h_88 delivers a Gmail-safe retina PNG.
const LOGO_URL =
  process.env.MAIL_LOGO_URL ||
  'https://res.cloudinary.com/jkew0usj/image/upload/f_png,h_88/v1784492249/dairyside/logo/dairyside2_qodnwa.svg';
const GREEN = '#16a34a';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Same visual shell as the customer backend's emails (kept locally — the two
// APIs deploy independently, so no cross-repo import).
function renderDeliveredEmail({ name, orders }) {
  const firstName = (name || 'there').split(' ')[0];
  const many = orders.length > 1;

  const rows = orders
    .map(
      (o) => `
      <tr>
        <td style="padding:6px 0;color:#374151;">${o.product_name || 'Order'}${o.size_label ? ` (${o.size_label})` : ''} × ${Number(o.quantity)}</td>
        <td style="padding:6px 0;text-align:right;color:#111827;font-weight:600;">${inr(o.total_amount)}</td>
      </tr>`
    )
    .join('');

  const html = `
  <div style="margin:0;padding:0;background:#f4f7f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="background:#ffffff;border-radius:14px 14px 0 0;border-bottom:1px solid #e5e7eb;padding:20px 30px;">
              <img src="${LOGO_URL}" alt="DairySide — Pure For Sure" height="44"
                   style="display:block;height:44px;width:auto;border:0;font-size:20px;font-weight:800;color:${GREEN};" />
            </td>
          </tr>
          <tr>
            <td style="background:${GREEN};padding:26px 30px;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;">Delivered! 📦</div>
              <div style="font-size:14px;color:#dcfce7;margin-top:6px;line-height:1.5;">
                Hi ${firstName}, your ${many ? 'orders have' : 'order has'} been delivered. Enjoy the freshness!
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:26px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
                <tr><td style="padding:16px 22px;">
                  <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:8px;">
                    ${many ? `${orders.length} orders delivered` : `Order ${orders[0].order_number}`}
                  </div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${rows}</table>
                </td></tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:20px auto 8px;">
                <tr><td style="background:${GREEN};border-radius:10px;">
                  <a href="${SITE_URL}/account?tab=orders"
                     style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                    View my orders
                  </a>
                </td></tr>
              </table>
              <div style="text-align:center;font-size:12px;color:#6b7280;margin-top:10px;">
                Something not right with this delivery? Reply to this email and we'll fix it.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:0 0 14px 14px;border-top:1px solid #e5e7eb;padding:20px 30px;">
              <div style="font-size:12px;color:#9ca3af;line-height:1.7;">
                © ${new Date().getFullYear()} DairySide · <a href="${SITE_URL}" style="color:${GREEN};text-decoration:none;">dairyside.in</a>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </div>`;

  const text =
    `Hi ${firstName},\n\nYour ${many ? `${orders.length} orders were` : 'order was'} delivered:\n` +
    orders.map((o) => `• ${o.order_number}: ${o.product_name || 'Order'} × ${Number(o.quantity)} — ${inr(o.total_amount)}`).join('\n') +
    `\n\nView: ${SITE_URL}/account?tab=orders\n\n— DairySide · Pure For Sure`;

  // Professional subject — no emoji, order number for single deliveries.
  const subject = many
    ? `Delivered — your ${orders.length} orders`
    : `Delivered — order ${orders[0].order_number}`;
  return { subject, html, text };
}

/**
 * Email customers whose ONE-TIME orders in `orderIds` are now delivered.
 * Groups by customer (one email each). Fire-and-forget: never throws.
 * @param {number[]} orderIds
 */
async function notifyOrdersDelivered(orderIds) {
  try {
    const ids = (orderIds || []).filter(Boolean);
    if (!ids.length || !mailer.isConfigured()) return;

    const [rows] = await pool.query(
      `SELECT o.id, o.quantity, o.total_amount, o.created_at,
              u.name, u.email,
              p.name AS product_name, pv.size_label
       FROM orders o
       JOIN users u ON u.uid = o.user_id ${C}
       LEFT JOIN product_variants pv ON pv.id = o.product_variant_id
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE o.id IN (?) AND o.status = 'delivered'
         AND o.order_type <> 'subscription_delivery'
         AND u.email IS NOT NULL`,
      [ids]
    );
    if (!rows.length) return;

    // One email per customer, listing all their delivered orders in this batch.
    const byEmail = new Map();
    for (const r of rows) {
      const entry = byEmail.get(r.email) || { name: r.name, orders: [] };
      entry.orders.push({ ...r, order_number: formatOrderNumber(r.id, r.created_at) });
      byEmail.set(r.email, entry);
    }

    for (const [email, { name, orders }] of byEmail) {
      try {
        await mailer.sendMail({ to: email, ...renderDeliveredEmail({ name, orders }) });
        logger.info('orderNotify.delivered_email', { to: email, orders: orders.map((o) => o.id) });
      } catch (err) {
        logger.error('orderNotify.send_failed', { to: email, message: err.message });
      }
    }
  } catch (err) {
    logger.error('orderNotify.failed', { message: err.message });
  }
}

module.exports = { notifyOrdersDelivered, renderDeliveredEmail };
