const { query } = require('../config/db');

const ScanModel = {
  async create({ projectId, triggeredBy, branch }) {
    const result = await query(
      `INSERT INTO scans (project_id, status, triggered_by, branch)
       VALUES ($1, 'pending', $2, $3) RETURNING *`,
      [projectId, triggeredBy || 'manual', branch]
    );
    return result.rows[0];
  },

  async findById(id) {
    const result = await query('SELECT * FROM scans WHERE id = $1', [id]);
    return result.rows[0];
  },

  // Scan + owner check in one query.
  async findByIdForUser(id, userId) {
    const result = await query(
      `SELECT s.* FROM scans s JOIN projects p ON p.id = s.project_id
       WHERE s.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    return result.rows[0];
  },

  async findAllByProject(projectId) {
    const result = await query(
      'SELECT * FROM scans WHERE project_id = $1 ORDER BY started_at DESC, id DESC',
      [projectId]
    );
    return result.rows;
  },

  // Every scan of every project of a user (History page).
  async findHistoryForUser(userId, limit = 100) {
    const result = await query(
      `SELECT s.*, p.name AS project_name, p.github_owner, p.github_repo,
              d.status AS deploy_status, d.url AS deploy_url
       FROM scans s
       JOIN projects p ON p.id = s.project_id
       LEFT JOIN LATERAL (
         SELECT * FROM deployments d WHERE d.scan_id = s.id ORDER BY d.created_at DESC, d.id DESC LIMIT 1
       ) d ON TRUE
       WHERE p.user_id = $1
       ORDER BY s.started_at DESC, s.id DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  },

  async markRunning(id, { runUrl, commitSha }) {
    const result = await query(
      `UPDATE scans SET status = 'running', run_url = COALESCE($2, run_url), commit_sha = COALESCE($3, commit_sha)
       WHERE id = $1 AND status IN ('pending', 'running') RETURNING *`,
      [id, runUrl || null, commitSha || null]
    );
    return result.rows[0];
  },

  async markFailed(id, message) {
    const result = await query(
      `UPDATE scans SET status = 'failed', error = $2, completed_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'running') RETURNING *`,
      [id, String(message || 'Scan failed').slice(0, 1000)]
    );
    return result.rows[0];
  },

  async complete(id, { securityScore, gateStatus, counts, secretsCount, reasons, scanners, commitSha }) {
    const result = await query(
      `UPDATE scans
       SET status = 'completed', security_score = $2, gate_status = $3, counts = $4::jsonb,
           secrets_count = $5, gate_reasons = $6::jsonb, scanners = $7::jsonb,
           commit_sha = COALESCE($8, commit_sha), completed_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'running')
       RETURNING *`,
      [id, securityScore, gateStatus, JSON.stringify(counts), secretsCount,
        JSON.stringify(reasons || []), JSON.stringify(scanners || {}), commitSha || null]
    );
    return result.rows[0];
  },
};

module.exports = ScanModel;
