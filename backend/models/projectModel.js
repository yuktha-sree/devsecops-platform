const { query } = require('../config/db');

// A project is a GitHub repository (owner/repo + branch) connected by a user.
// The list query also returns the latest scan so the dashboard needs one call.
const WITH_LATEST_SCAN = `
  SELECT p.*,
         ls.id             AS latest_scan_id,
         ls.status         AS latest_scan_status,
         ls.security_score AS latest_score,
         ls.gate_status    AS latest_gate_status,
         ls.counts         AS latest_counts,
         ls.secrets_count  AS latest_secrets,
         ls.gate_reasons   AS latest_reasons,
         ls.scanners       AS latest_scanners,
         ls.branch         AS latest_branch,
         ls.commit_sha     AS latest_commit,
         ls.run_url        AS latest_run_url,
         ls.error          AS latest_error,
         ls.started_at     AS latest_started_at,
         ls.completed_at   AS latest_completed_at,
         (SELECT COUNT(*) FROM scans s WHERE s.project_id = p.id)::int AS scan_count,
         ld.status         AS latest_deploy_status,
         ld.url            AS latest_deploy_url,
         ld.logs           AS latest_deploy_logs,
         ld.deployed_at    AS latest_deployed_at
  FROM projects p
  LEFT JOIN LATERAL (
    SELECT * FROM scans s WHERE s.project_id = p.id ORDER BY s.started_at DESC, s.id DESC LIMIT 1
  ) ls ON TRUE
  LEFT JOIN LATERAL (
    SELECT * FROM deployments d WHERE d.scan_id = ls.id ORDER BY d.created_at DESC, d.id DESC LIMIT 1
  ) ld ON TRUE
`;

const ProjectModel = {
  async create({ userId, name, githubOwner, githubRepo, branch, githubRepoUrl }) {
    const result = await query(
      `INSERT INTO projects (user_id, name, github_owner, github_repo, branch, github_repo_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, github_owner, github_repo)
       DO UPDATE SET branch = EXCLUDED.branch
       RETURNING *`,
      [userId, name, githubOwner, githubRepo, branch, githubRepoUrl]
    );
    return result.rows[0];
  },

  async findAllByUser(userId) {
    const result = await query(
      `${WITH_LATEST_SCAN} WHERE p.user_id = $1 ORDER BY p.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  // Ownership is part of the query: a user can never load someone else's project.
  async findByIdForUser(id, userId) {
    const result = await query(`${WITH_LATEST_SCAN} WHERE p.id = $1 AND p.user_id = $2`, [id, userId]);
    return result.rows[0];
  },

  async findById(id) {
    const result = await query('SELECT * FROM projects WHERE id = $1', [id]);
    return result.rows[0];
  },

  async updateSettings(id, { gateConfig, deployEnabled, branch }) {
    const result = await query(
      `UPDATE projects
       SET gate_config    = COALESCE($2::jsonb, gate_config),
           deploy_enabled = COALESCE($3, deploy_enabled),
           branch         = COALESCE($4, branch)
       WHERE id = $1 RETURNING *`,
      [id, gateConfig ? JSON.stringify(gateConfig) : null, deployEnabled === undefined ? null : deployEnabled, branch || null]
    );
    return result.rows[0];
  },

  async setLiveUrl(id, url) {
    await query('UPDATE projects SET live_url = $2 WHERE id = $1', [id, url]);
  },

  async remove(id, userId) {
    const result = await query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    return result.rowCount > 0;
  },
};

module.exports = ProjectModel;
