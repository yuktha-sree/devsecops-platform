const jwt = require('jsonwebtoken');
const GithubService = require('../services/githubService');
const { frontendUrl } = require('../utils/frontendUrl');
const UserModel = require('../models/userModel');

const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
// Git branch names: letters, digits and . _ / - only, never starting with '-'.
const BRANCH_RE = /^(?!-)[A-Za-z0-9._/-]{1,255}$/;

const GithubController = {
  async status(req, res, next) {
    try {
      const user = await UserModel.findById(req.user.id);
      res.json({
        connected: Boolean(user && user.github_login),
        login: (user && user.github_login) || null,
        connectedAt: (user && user.github_connected_at) || null,
        oauthAvailable: GithubService.oauthConfigured(),
      });
    } catch (err) {
      next(err);
    }
  },

  // Personal access token flow (works without registering an OAuth app).
  async connectWithToken(req, res, next) {
    try {
      const token = String((req.body && req.body.token) || '').trim();
      if (token.length < 20) return res.status(400).json({ error: 'Paste a valid GitHub token.' });
      const profile = await GithubService.saveToken(req.user.id, token);
      res.json({ connected: true, ...profile });
    } catch (err) {
      next(err);
    }
  },

  oauthUrl(req, res, next) {
    try {
      res.json({ url: GithubService.oauthAuthorizeUrl(req.user.id) });
    } catch (err) {
      next(err);
    }
  },

  // Public route: GitHub redirects the browser here after the user approves.
  // Used both by "Connect GitHub" (logged-in user) and "Sign in with GitHub".
  async oauthCallback(req, res) {
    const front = frontendUrl();
    const { code, state } = req.query;
    const wasLogin = (jwt.decode(String(state || '')) || {}).purpose === 'github-login';
    try {
      if (!code || !state) throw new Error('Missing code from GitHub.');
      const result = await GithubService.completeOAuth({ code: String(code), state: String(state) });
      if (result.mode === 'login') {
        // The token travels in the URL fragment (#...), which browsers never send to any server.
        return res.redirect(`${front}/login#github_token=${encodeURIComponent(result.token)}`);
      }
      res.redirect(`${front}/connect?github=connected`);
    } catch (err) {
      const page = wasLogin ? 'login' : 'connect';
      res.redirect(`${front}/${page}?github=error&message=${encodeURIComponent(err.message)}`);
    }
  },

  async disconnect(req, res, next) {
    try {
      await GithubService.disconnect(req.user.id);
      res.json({ connected: false });
    } catch (err) {
      next(err);
    }
  },

  async repos(req, res, next) {
    try {
      res.json({ repositories: await GithubService.listRepos(req.user.id) });
    } catch (err) {
      next(err);
    }
  },

  async branches(req, res, next) {
    try {
      const { owner, repo } = req.params;
      if (!NAME_RE.test(owner) || !NAME_RE.test(repo)) return res.status(400).json({ error: 'Invalid repository name' });
      res.json({ branches: await GithubService.listBranches(req.user.id, owner, repo) });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = GithubController;
module.exports.NAME_RE = NAME_RE;
module.exports.BRANCH_RE = BRANCH_RE;
