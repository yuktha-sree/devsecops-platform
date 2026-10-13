// Cleans a PostgreSQL connection string copied from Neon / Supabase / Vercel.
//  - removes quotes and surrounding spaces
//  - removes "channel_binding=..." (not needed, and a common source of errors)
//  - rewrites sslmode=require|prefer|verify-ca to sslmode=verify-full, which is
//    exactly what the "pg" library already does for those values. This only
//    silences its security warning and keeps the behaviour identical.
function sanitizeDatabaseUrl(raw) {
  let url = String(raw || '').trim();
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1).trim();
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) return url;

  const q = url.indexOf('?');
  if (q === -1) return url;

  const base = url.slice(0, q);
  const params = new URLSearchParams(url.slice(q + 1));
  params.delete('channel_binding');
  const mode = params.get('sslmode');
  if (mode && ['require', 'prefer', 'verify-ca'].includes(mode.toLowerCase())) {
    params.set('sslmode', 'verify-full');
  }
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}

// Returns a short human-readable problem, or null when the link looks usable.
// Never includes the password in the message.
function describeDatabaseUrlProblem(raw) {
  const url = String(raw || '').trim();
  if (!url) return 'DATABASE_URL is empty.';
  if (!/^postgres(ql)?:\/\//i.test(url)) return 'DATABASE_URL must start with postgresql://';
  if (/PASTE|YOUR_|PLACEHOLDER|HERE/i.test(url)) return 'DATABASE_URL still contains placeholder text.';
  const m = url.match(/^postgres(?:ql)?:\/\/([^:@/]+):([^@]*)@([^/?]+)/i);
  if (!m) return 'DATABASE_URL does not look like postgresql://user:password@host/database';
  if (m[2].includes('*')) return 'The password in DATABASE_URL is hidden (stars). In Neon turn on "Show password" before copying.';
  if (!m[2]) return 'DATABASE_URL has no password.';
  return null;
}

module.exports = { sanitizeDatabaseUrl, describeDatabaseUrlProblem };
