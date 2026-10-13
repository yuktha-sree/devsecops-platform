const { query } = require('../config/db');

const PasswordResetModel = {
  // One active link per user: older unused links stop working when a new one is requested.
  async create(userId, tokenHash, minutes) {
    await query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [userId]);
    await query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + make_interval(mins => $3))`,
      [userId, tokenHash, minutes]
    );
  },

  async findValid(tokenHash) {
    const result = await query(
      `SELECT id, user_id FROM password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    return result.rows[0];
  },

  async deleteForUser(userId) {
    await query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
  },
};

module.exports = PasswordResetModel;
