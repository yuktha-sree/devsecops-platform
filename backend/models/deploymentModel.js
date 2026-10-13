const { query } = require('../config/db');

const DeploymentModel = {
  async create({ projectId, scanId, status, logs, url, environment }) {
    const result = await query(
      // deployed_at is decided here (not with CASE WHEN $3 = ...) because PostgreSQL
      // cannot infer one type for a parameter that is used twice.
      `INSERT INTO deployments (project_id, scan_id, status, logs, url, environment, deployed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [projectId, scanId, status, logs, url || null, environment || null, status === 'deployed' ? new Date() : null]
    );
    return result.rows[0];
  },

  // Latest deployment row of a scan is updated by the workflow once Vercel finishes.
  async updateForScan(scanId, { status, logs, url }) {
    const result = await query(
      `UPDATE deployments
       SET status = $2, logs = COALESCE($3, logs), url = COALESCE($4, url),
           deployed_at = COALESCE($5::timestamp, deployed_at)
       WHERE id = (SELECT id FROM deployments WHERE scan_id = $1 ORDER BY id DESC LIMIT 1)
       RETURNING *`,
      [scanId, status, logs || null, url || null, status === 'deployed' ? new Date() : null]
    );
    return result.rows[0];
  },

  async findByProject(projectId) {
    const result = await query(
      'SELECT * FROM deployments WHERE project_id = $1 ORDER BY created_at DESC, id DESC',
      [projectId]
    );
    return result.rows;
  },

  async findAllForUser(userId, limit = 100) {
    const result = await query(
      `SELECT d.*, p.name AS project_name FROM deployments d
       JOIN projects p ON p.id = d.project_id
       WHERE p.user_id = $1 ORDER BY d.created_at DESC, d.id DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  },
};

module.exports = DeploymentModel;
