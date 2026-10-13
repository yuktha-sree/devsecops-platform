// The public address of the website (used in reset-password links and GitHub redirects).
// FRONTEND_URL wins; otherwise the first entry of FRONTEND_ORIGIN is used.
function frontendUrl() {
  const explicit = String(process.env.FRONTEND_URL || '').trim();
  const first = String(process.env.FRONTEND_ORIGIN || '').split(',')[0].trim();
  const value = explicit || (first.includes('*') ? '' : first) || 'http://localhost:5173';
  return value.replace(/\/$/, '');
}

module.exports = { frontendUrl };
