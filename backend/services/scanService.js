const { query } = require('../config/db');
const ScanModel = require('../models/scanModel');
const ProjectModel = require('../models/projectModel');
const VulnerabilityModel = require('../models/vulnerabilityModel');
const DeploymentModel = require('../models/deploymentModel');
const GithubService = require('./githubService');
const {
  calculateSecurityScore,
  evaluateGateDetailed,
  mergeGateResults,
  resolveConfig,
} = require('./securityScoreService');

const STALE_AFTER_MINUTES = 60;
const ENVIRONMENT = 'Vercel';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true; // message is written for the user, safe to show
  return err;
}

const ScanService = {
  // User clicks "Scan repository": create the scan row and start the
  // GitHub Actions workflow that runs the four scanners.
  async startScan({ userId, projectId, branch }) {
    const project = await ProjectModel.findByIdForUser(projectId, userId);
    if (!project) throw httpError(404, 'Project not found');
    if (!project.github_owner || !project.github_repo) throw httpError(400, 'This project has no GitHub repository');

    // Needs a connected GitHub account (also checked again by the workflow).
    await GithubService.getToken(userId);

    // One scan at a time per project; scans stuck for an hour are closed.
    const open = (await query(
      `SELECT id, started_at FROM scans WHERE project_id = $1 AND status IN ('pending','running')`,
      [project.id]
    )).rows;
    for (const s of open) {
      const ageMin = (Date.now() - new Date(s.started_at).getTime()) / 60000;
      if (ageMin > STALE_AFTER_MINUTES) await ScanModel.markFailed(s.id, 'Scan timed out');
      else throw httpError(409, 'A scan for this repository is already running.');
    }

    const scanBranch = String(branch || project.branch || 'main').slice(0, 255);
    if (scanBranch !== project.branch) await ProjectModel.updateSettings(project.id, { branch: scanBranch });

    const scan = await ScanModel.create({ projectId: project.id, triggeredBy: 'manual', branch: scanBranch });
    try {
      await GithubService.dispatchScan(scan.id);
    } catch (err) {
      await ScanModel.markFailed(scan.id, `Could not start the scan workflow: ${err.message}`);
      throw err;
    }
    return ScanModel.findById(scan.id);
  },

  // What the workflow needs to scan the repository.
  async getSource(scan) {
    if (!['pending', 'running'].includes(scan.status)) throw httpError(409, 'This scan is already finished');
    const project = await ProjectModel.findById(scan.project_id);
    const { token } = await GithubService.getToken(project.user_id);
    const config = resolveConfig(project.gate_config);
    return {
      scanId: scan.id,
      projectId: project.id,
      repository: `${project.github_owner}/${project.github_repo}`,
      branch: scan.branch || project.branch || 'main',
      token,
      gateConfig: config,
      deploy: project.deploy_enabled !== false,
      slug: `${project.github_owner}-${project.github_repo}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90),
    };
  },

  // The workflow posts the normalized findings (security/normalizer) and the
  // verdict of the Python gate (security/security-gate). The backend stores the
  // findings, re-computes score + verdict with the project's own gate rules,
  // and returns the FINAL decision the workflow must obey before deploying.
  async submitScanResults({ scan, vulnerabilities, scanners, gate, commitSha }) {
    if (!['pending', 'running'].includes(scan.status)) throw httpError(409, 'This scan is already finished');
    if (!Array.isArray(vulnerabilities)) throw httpError(400, 'vulnerabilities[] is required');

    const project = await ProjectModel.findById(scan.project_id);
    const config = resolveConfig(project.gate_config);

    const { score, counts } = calculateSecurityScore(vulnerabilities, config);
    const local = evaluateGateDetailed(counts, score, vulnerabilities, config, scanners);
    const final = mergeGateResults(local, gate);

    await VulnerabilityModel.bulkInsert(scan.id, vulnerabilities);

    const updated = await ScanModel.complete(scan.id, {
      securityScore: score,
      gateStatus: final.status,
      counts,
      secretsCount: local.secrets,
      reasons: final.reasons,
      scanners,
      commitSha,
    });
    if (!updated) {
      await VulnerabilityModel.removeByScan(scan.id);
      throw httpError(409, 'This scan is already finished');
    }

    const passed = final.status === 'PASS';
    const willDeploy = passed && project.deploy_enabled !== false;
    const deployment = await DeploymentModel.create({
      projectId: project.id,
      scanId: scan.id,
      status: passed ? 'allowed' : 'blocked',
      environment: ENVIRONMENT,
      logs: passed
        ? (willDeploy ? 'Security gate passed. Waiting for the Vercel deployment.' : 'Security gate passed. Automatic deployment is switched off for this project.')
        : `Security gate failed. ${final.reasons.join(' ')}`,
    });

    return { scan: updated, severityCounts: counts, gate: final, deployment, deploy: willDeploy };
  },

  async recordDeployment({ scan, status, url, logs }) {
    if (scan.status !== 'completed' || scan.gate_status !== 'PASS') {
      throw httpError(409, 'Only a scan that passed the security gate can be deployed');
    }
    if (!['deployed', 'failed'].includes(status)) throw httpError(400, 'status must be "deployed" or "failed"');
    if (status === 'deployed' && !/^https:\/\/[^\s]+$/.test(String(url || ''))) {
      throw httpError(400, 'A valid https url is required for a deployment');
    }
    const deployment = await DeploymentModel.updateForScan(scan.id, {
      status,
      url: status === 'deployed' ? url : null,
      logs: status === 'deployed' ? `Deployed to Vercel: ${url}` : String(logs || 'Deployment failed').slice(0, 2000),
    });
    if (status === 'deployed') await ProjectModel.setLiveUrl(scan.project_id, url);
    return deployment;
  },
};

module.exports = ScanService;
