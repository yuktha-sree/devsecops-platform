const { query } = require('../config/db');

const PUBLIC_COLUMNS = 'id, name, email, role, created_at, github_login, github_connected_at';

const UserModel = {
  async create({ name, email, passwordHash }) {
    const result = await query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash]
    );
    return result.rows[0];
  },

  async findByEmail(email) {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  },

  async findById(id) {
    const result = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
    return result.rows[0];
  },

  // Includes the encrypted token - only used server-side by the GitHub service.
  async findWithGithubToken(id) {
    const result = await query('SELECT id, github_login, github_token_enc FROM users WHERE id = $1', [id]);
    return result.rows[0];
  },

  async findByGithubId(githubId) {
    const result = await query('SELECT * FROM users WHERE github_id = $1', [String(githubId)]);
    return result.rows[0];
  },

  // Accounts that connected GitHub before github_id existed.
  async findByGithubLoginWithoutId(login) {
    const result = await query(
      'SELECT * FROM users WHERE lower(github_login) = lower($1) AND github_id IS NULL',
      [login]
    );
    return result.rows[0];
  },

  async setGithub(id, { login, tokenEnc, githubId = null }) {
    await query(
      `UPDATE users
          SET github_login = $2, github_token_enc = $3, github_connected_at = NOW(),
              github_id = COALESCE($4, github_id)
        WHERE id = $1`,
      [id, login, tokenEnc, githubId === null ? null : String(githubId)]
    );
  },

  async updatePassword(id, passwordHash) {
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
  },

  async clearGithub(id) {
    await query(
      `UPDATE users SET github_login = NULL, github_token_enc = NULL, github_connected_at = NULL WHERE id = $1`,
      [id]
    );
  },
};

module.exports = UserModel;
