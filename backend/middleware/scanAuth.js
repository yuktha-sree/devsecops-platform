// Authenticates the GitHub Actions scan workflow (machine-to-machine).
//
// The workflow knows SCAN_SECRET (a GitHub Actions secret) and sends
//     x-scan-auth: HMAC_SHA256(SCAN_SECRET, scan_id)
// so only a run started for that exact scan can report on it. The scan must
// still be open (pending/running); once it is completed it cannot be changed.
const { signScanId, safeEqualHex } = require('../utils/crypto');
const ScanModel = require('../models/scanModel');

async function scanAuth(req, res, next) {
  try {
    const scanId = Number(req.params.id);
    if (!Number.isInteger(scanId)) return res.status(400).json({ error: 'Invalid scan id' });

    const provided = req.headers['x-scan-auth'];
    if (!provided || !safeEqualHex(provided, signScanId(scanId))) {
      return res.status(401).json({ error: 'Invalid scan credentials' });
    }

    const scan = await ScanModel.findById(scanId);
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    req.scan = scan;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = scanAuth;
