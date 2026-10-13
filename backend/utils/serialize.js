// Converts database rows into the JSON shape the frontend uses.
const { resolveConfig } = require('../services/securityScoreService');

function serializeProject(p) {
  const config = resolveConfig(p.gate_config);
  const hasScan = p.latest_scan_id !== null && p.latest_scan_id !== undefined;
  return {
    id: p.id,
    name: p.name,
    owner: p.github_owner,
    repo: p.github_repo,
    fullName: p.github_owner && p.github_repo ? `${p.github_owner}/${p.github_repo}` : p.name,
    url: p.github_repo_url,
    branch: p.branch || 'main',
    deployEnabled: p.deploy_enabled !== false,
    liveUrl: p.live_url || null,
    gate: config.gate,
    weights: config.scoring.weights,
    scanCount: p.scan_count || 0,
    createdAt: p.created_at,
    latestScan: hasScan
      ? {
          id: p.latest_scan_id,
          status: p.latest_scan_status,
          score: p.latest_score,
          gateStatus: p.latest_gate_status,
          counts: p.latest_counts || { Critical: 0, High: 0, Medium: 0, Low: 0 },
          secrets: p.latest_secrets || 0,
          reasons: p.latest_reasons || [],
          scanners: p.latest_scanners || {},
          branch: p.latest_branch,
          commit: p.latest_commit,
          runUrl: p.latest_run_url,
          error: p.latest_error,
          startedAt: p.latest_started_at,
          completedAt: p.latest_completed_at,
          deployment: p.latest_deploy_status
            ? { status: p.latest_deploy_status, url: p.latest_deploy_url, logs: p.latest_deploy_logs, at: p.latest_deployed_at }
            : null,
        }
      : null,
  };
}

function serializeScan(s) {
  return {
    id: s.id,
    projectId: s.project_id,
    status: s.status,
    score: s.security_score,
    gateStatus: s.gate_status,
    counts: s.counts || { Critical: 0, High: 0, Medium: 0, Low: 0 },
    secrets: s.secrets_count || 0,
    reasons: s.gate_reasons || [],
    scanners: s.scanners || {},
    branch: s.branch,
    commit: s.commit_sha,
    runUrl: s.run_url,
    error: s.error,
    triggeredBy: s.triggered_by,
    startedAt: s.started_at,
    completedAt: s.completed_at,
    projectName: s.project_name,
    deployStatus: s.deploy_status || null,
    deployUrl: s.deploy_url || null,
  };
}

function serializeVulnerability(v) {
  return {
    id: v.id,
    tool: v.tool,
    type: v.type,
    title: v.title,
    severity: v.severity,
    description: v.description,
    file: v.file_component,
    line: v.line,
    ruleId: v.rule_id,
    cve: v.cve,
    status: v.status,
  };
}

function serializeDeployment(d) {
  return {
    id: d.id,
    projectId: d.project_id,
    scanId: d.scan_id,
    projectName: d.project_name,
    status: d.status,
    url: d.url,
    environment: d.environment,
    logs: d.logs,
    deployedAt: d.deployed_at,
    createdAt: d.created_at,
  };
}

module.exports = { serializeProject, serializeScan, serializeVulnerability, serializeDeployment };
