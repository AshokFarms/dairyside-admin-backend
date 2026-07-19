// Minimal outbound email for the admin API — Brevo HTTP API ONLY (no SMTP;
// PaaS hosts block SMTP ports, and per project decision SMTP is not used).
// Mirrors the customer backend's mailer transport but stays dependency-light.
const axios = require('axios');
const logger = require('./logger');

const API_KEY = process.env.BREVO_API_KEY;
const FROM = {
  name: process.env.MAIL_FROM_NAME || 'DairySide',
  email: process.env.MAIL_FROM_EMAIL || 'no-reply@dairyside.in',
};

const isConfigured = () => Boolean(API_KEY);

async function sendMail({ to, subject, html, text }) {
  if (!isConfigured()) throw new Error('BREVO_API_KEY not configured');
  const res = await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    { sender: FROM, to: [{ email: to }], subject, htmlContent: html, textContent: text },
    { headers: { 'api-key': API_KEY, 'content-type': 'application/json' }, timeout: 15000 }
  );
  logger.info('mail.sent', { to, subject, messageId: res.data?.messageId });
  return { messageId: res.data?.messageId };
}

module.exports = { isConfigured, sendMail };
