const test = require('node:test');
const assert = require('node:assert');
const { describeDbError } = require('../utils/dbErrors');
const errorHandler = require('../middleware/errorHandler');

function run(err) {
  let out;
  const res = { status(s) { out = { status: s }; return this; }, json(b) { out.body = b; } };
  const log = console.error; console.error = () => {};
  errorHandler(err, {}, res, () => {});
  console.error = log;
  return out;
}

test('wrong password is explained', () => {
  assert.match(describeDbError({ code: '28P01' }), /DB_PASSWORD/);
});

test('missing tables are explained', () => {
  assert.match(describeDbError({ code: '42P01' }), /migrate/);
});

test('IPv4/IPv6 wrapped connection errors are detected', () => {
  assert.match(describeDbError({ errors: [{ code: 'ECONNREFUSED' }] }), /PostgreSQL/);
});

test('unknown errors stay generic', () => {
  assert.strictEqual(describeDbError(new Error('boom')), null);
  assert.deepStrictEqual(run(new Error('boom')), { status: 500, body: { error: 'Internal server error' } });
});

test('database errors become a 503 with a hint in development', () => {
  process.env.NODE_ENV = 'development';
  const out = run(Object.assign(new Error('x'), { code: '28P01' }));
  assert.strictEqual(out.status, 503);
  assert.match(out.body.error, /DB_PASSWORD/);
});
