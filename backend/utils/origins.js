// CORS helper. FRONTEND_ORIGIN may hold several comma-separated origins and
// may use "*" for one sub-domain label, e.g. https://*.vercel.app (handy for
// Vercel preview deployments).
function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function escapeRegex(text) {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function buildOriginMatcher(list) {
  const exact = new Set();
  const patterns = [];
  for (const entry of list) {
    if (entry.includes('*')) {
      patterns.push(new RegExp(`^${escapeRegex(entry).replace(/\*/g, '[A-Za-z0-9-]+')}$`, 'i'));
    } else {
      exact.add(entry);
    }
  }
  return (origin) => exact.has(origin) || patterns.some((re) => re.test(origin));
}

module.exports = { parseOrigins, buildOriginMatcher };
