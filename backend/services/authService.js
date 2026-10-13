const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const UserModel = require('../models/userModel');
const PasswordResetModel = require('../models/passwordResetModel');
const { signSession } = require('../utils/session');
const { frontendUrl } = require('../utils/frontendUrl');
const { sendResetEmail } = require('../utils/mailer');

const RESET_MINUTES = 30;
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

const AuthService = {
  async register({ name, email, password }) {
    const existing = await UserModel.findByEmail(email);
    if (existing) {
      const err = new Error('Email already registered');
      err.status = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({ name, email, passwordHash });
    return user;
  },

  async login({ email, password }) {
    const user = await UserModel.findByEmail(email);
    if (!user) {
      const err = new Error('Invalid email or password');
      err.status = 401;
      throw err;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const err = new Error('Invalid email or password');
      err.status = 401;
      throw err;
    }

    return {
      token: signSession(user),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  },

  // Always finishes without telling the caller whether the e-mail exists.
  async forgotPassword(email) {
    const user = await UserModel.findByEmail(email);
    if (!user) return;

    const rawToken = crypto.randomBytes(32).toString('hex');
    await PasswordResetModel.create(user.id, sha256(rawToken), RESET_MINUTES);
    const link = `${frontendUrl()}/reset-password?token=${rawToken}`;
    try {
      await sendResetEmail({ to: user.email, name: user.name, link, minutes: RESET_MINUTES });
    } catch (err) {
      // The person asking must not learn whether the account exists, so only the server log shows this.
      console.error(`[forgot-password] could not send the e-mail: ${err.message}`);
    }
  },

  async resetPassword({ token, password }) {
    const row = await PasswordResetModel.findValid(sha256(token));
    if (!row) throw httpError(400, 'This reset link is invalid or has expired. Request a new one.');
    const passwordHash = await bcrypt.hash(password, 10);
    await UserModel.updatePassword(row.user_id, passwordHash);
    await PasswordResetModel.deleteForUser(row.user_id); // the link (and any older one) can't be used again
  },
};

module.exports = AuthService;
module.exports.RESET_MINUTES = RESET_MINUTES;
