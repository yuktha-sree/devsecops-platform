// Small crypto helpers.
//  - encrypt/decrypt: AES-256-GCM, used to store each user's GitHub token
//    at rest (the database never holds the raw token).
//  - signScanId/verifyScanAuth: HMAC used by the GitHub Actions scan workflow
//    to prove it was started by this platform (see middleware/scanAuth.js).
const crypto = require('crypto');

function requireSecret(name) {
  const value = process.env[name];
  if (!value || value.length < 16) {
    const err = new Error(`${name} is not set (use a random string of at least 16 characters)`);
    err.status = 500;
    err.expose = true;
    throw err;
  }
  return value;
}

function encryptionKey() {
  // Derive a fixed 32-byte key from the configured secret.
  return crypto.createHash('sha256').update(requireSecret('TOKEN_ENC_KEY')).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString('base64')).join('.');
}

function decrypt(payload) {
  const [iv, tag, data] = String(payload).split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function signScanId(scanId) {
  return crypto.createHmac('sha256', requireSecret('SCAN_SECRET')).update(String(scanId)).digest('hex');
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { encrypt, decrypt, signScanId, safeEqualHex };
