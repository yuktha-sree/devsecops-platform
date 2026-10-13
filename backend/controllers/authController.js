const AuthService = require('../services/authService');
const GithubService = require('../services/githubService');
const UserModel = require('../models/userModel');
const { frontendUrl } = require('../utils/frontendUrl');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AuthController = {
  async register(req, res, next) {
    try {
      const { name, email, password } = req.body || {};
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'name, email, and password are required' });
      }
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const user = await AuthService.register({
        name: String(name).trim().slice(0, 100),
        email: String(email).trim().toLowerCase(),
        password: String(password),
      });
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  },

  async login(req, res, next) {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }
      const result = await AuthService.login({ email: String(email).trim().toLowerCase(), password: String(password) });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  // Tells the login page which sign-in options this server offers.
  providers(req, res) {
    res.json({ github: GithubService.oauthConfigured() });
  },

  // Browser navigation: send the person to GitHub. Errors go back to the login page.
  githubStart(req, res) {
    try {
      res.redirect(GithubService.loginAuthorizeUrl());
    } catch (err) {
      res.redirect(`${frontendUrl()}/login?github=error&message=${encodeURIComponent(err.message)}`);
    }
  },

  async forgotPassword(req, res, next) {
    try {
      const email = String((req.body && req.body.email) || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
      await AuthService.forgotPassword(email);
      // Same answer whether or not the e-mail is registered.
      res.json({ message: 'If that email is registered, a password reset link has been sent.' });
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body || {};
      if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
      if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      await AuthService.resetPassword({ token: String(token), password: String(password) });
      res.json({ message: 'Password updated. You can now log in.' });
    } catch (err) {
      next(err);
    }
  },

  async me(req, res, next) {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) return res.status(401).json({ error: 'Account no longer exists' });
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = AuthController;
