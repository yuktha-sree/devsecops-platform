const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const DeploymentController = require('../controllers/deploymentController');

router.use(authenticate);

router.get('/', DeploymentController.listAll);
router.get('/:projectId', DeploymentController.listByProject);

module.exports = router;
