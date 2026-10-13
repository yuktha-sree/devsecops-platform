// Sends e-mail through SMTP (Gmail, Outlook, Brevo, Mailtrap ...).
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in backend/.env.
// While SMTP is not configured (development only) the message is printed in the
// backend terminal instead, so forgot-password can still be tested without e-mail.
function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendMail({ to, subject, text, html }) {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP is not configured (set SMTP_HOST, SMTP_USER and SMTP_PASS).');
    }
    console.log(`\n[mail] SMTP is not configured, so this e-mail is only printed here.\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { logged: true };
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    throw new Error('The nodemailer package is missing. Run: npm --prefix backend install nodemailer');
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
  return { sent: true };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendResetEmail({ to, name, link, minutes }) {
  const text =
    `Hi ${name},\n\n` +
    `We received a request to reset your TechShield password.\n` +
    `Open this link to choose a new password (valid for ${minutes} minutes):\n\n${link}\n\n` +
    `If you did not ask for this, you can ignore this e-mail. Your password stays the same.`;
  const html =
    `<p>Hi ${escapeHtml(name)},</p>` +
    `<p>We received a request to reset your TechShield password.</p>` +
    `<p><a href="${escapeHtml(link)}">Choose a new password</a> (valid for ${minutes} minutes)</p>` +
    `<p>If you did not ask for this, you can ignore this e-mail. Your password stays the same.</p>`;
  return sendMail({ to, subject: 'Reset your TechShield password', text, html });
}

module.exports = { sendMail, sendResetEmail, smtpConfigured };
