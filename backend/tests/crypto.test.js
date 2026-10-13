const test = require('node:test');
const assert = require('node:assert');

process.env.TOKEN_ENC_KEY = 'unit-test-encryption-key-123456';
process.env.SCAN_SECRET = 'unit-test-scan-secret-1234567';
const { encrypt, decrypt, signScanId, safeEqualHex } = require('../utils/crypto');

test('GitHub tokens round-trip and are not stored in clear text', () => {
  const enc = encrypt('ghp_exampletoken123');
  assert.ok(!enc.includes('ghp_exampletoken123'));
  assert.strictEqual(decrypt(enc), 'ghp_exampletoken123');
});

test('tampering with an encrypted token is detected', () => {
  const enc = encrypt('secret');
  const parts = enc.split('.');
  parts[2] = Buffer.from('xxxxxx').toString('base64');
  assert.throws(() => decrypt(parts.join('.')));
});

test('scan signature only matches its own scan id', () => {
  assert.ok(safeEqualHex(signScanId(7), signScanId(7)));
  assert.ok(!safeEqualHex(signScanId(7), signScanId(8)));
});
