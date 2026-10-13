const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const GithubController = require('../controllers/githubController');

// GitHub redirects the browser here, so it cannot carry our JWT.
router.get('/oauth/callback', GithubController.oauthCallback);

router.use(authenticate);
router.get('/status', GithubController.status);
router.post('/connect', GithubController.connectWithToken);
router.get('/oauth/url', GithubController.oauthUrl);
router.delete('/connection', GithubController.disconnect);
router.get('/repos', GithubController.repos);
router.get('/repos/:owner/:repo/branches', GithubController.branches);

module.exports = router;
