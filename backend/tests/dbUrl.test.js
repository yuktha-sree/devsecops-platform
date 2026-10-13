const test = require('node:test');
const assert = require('node:assert');
const { sanitizeDatabaseUrl, describeDatabaseUrlProblem } = require('../utils/dbUrl');
const { parseOrigins, buildOriginMatcher } = require('../utils/origins');

test('Neon link: channel_binding removed and sslmode made explicit', () => {
  const out = sanitizeDatabaseUrl('postgresql://u:p@ep-x-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
  assert.strictEqual(out, 'postgresql://u:p@ep-x-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=verify-full');
});

test('quotes and spaces are removed, other links untouched', () => {
  assert.strictEqual(sanitizeDatabaseUrl('  "postgresql://u:p@h/db"  '), 'postgresql://u:p@h/db');
  assert.strictEqual(sanitizeDatabaseUrl('postgresql://u:p@h/db?application_name=x'), 'postgresql://u:p@h/db?application_name=x');
  assert.strictEqual(sanitizeDatabaseUrl('not a url'), 'not a url');
});

test('problems are described without leaking the password', () => {
  assert.match(describeDatabaseUrlProblem('PASTE_YOUR_NEON_LINK_HERE'), /postgresql/);
  assert.match(describeDatabaseUrlProblem('postgresql://u:PASTE@h/db'), /placeholder/);
  assert.match(describeDatabaseUrlProblem('postgresql://u:*****@h/db'), /Show password/);
  assert.strictEqual(describeDatabaseUrlProblem('postgresql://neondb_owner:abc123@host.neon.tech/neondb?sslmode=require'), null);
});

test('CORS origins: exact and wildcard', () => {
  const ok = buildOriginMatcher(parseOrigins('http://localhost:5173/, https://app.vercel.app, https://*.vercel.app'));
  assert.ok(ok('http://localhost:5173'));
  assert.ok(ok('https://app.vercel.app'));
  assert.ok(ok('https://app-git-main-team.vercel.app'));
  assert.ok(!ok('https://evil.com'));
  assert.ok(!ok('https://evil.com/.vercel.app'));
  assert.ok(!ok('https://a.b.vercel.app'));
  assert.ok(!ok('http://app.vercel.app'));
});
