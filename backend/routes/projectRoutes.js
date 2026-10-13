const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const ProjectController = require('../controllers/projectController');

router.use(authenticate);

router.get('/defaults', ProjectController.defaults);
router.post('/', ProjectController.create);
router.get('/', ProjectController.list);
router.get('/:id', ProjectController.getById);
router.patch('/:id/settings', ProjectController.updateSettings);
router.delete('/:id', ProjectController.remove);

module.exports = router;
