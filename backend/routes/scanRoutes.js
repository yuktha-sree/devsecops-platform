const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const scanAuth = require('../middleware/scanAuth');
const ScanController = require('../controllers/scanController');

// --- GitHub Actions scan workflow -> backend (authenticated with x-scan-auth) ---
router.post('/:id/start', scanAuth, ScanController.start);
router.get('/:id/source', scanAuth, ScanController.source);
router.post('/:id/results', scanAuth, ScanController.submitResults);
router.post('/:id/deployment', scanAuth, ScanController.deployment);
router.post('/:id/fail', scanAuth, ScanController.fail);

// --- Browser -> backend (JWT) ---
router.use(authenticate);
router.post('/', ScanController.create);
router.get('/history', ScanController.history);
router.get('/project/:projectId', ScanController.listByProject);
router.get('/:id', ScanController.getById);

module.exports = router;
