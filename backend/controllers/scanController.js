const ScanModel = require('../models/scanModel');
const ProjectModel = require('../models/projectModel');
const ScanService = require('../services/scanService');
const { serializeScan } = require('../utils/serialize');
const { BRANCH_RE } = require('./githubController');

const ScanController = {
  // ---- called by the browser (JWT) -------------------------------------
  // "Scan repository": creates the scan and starts the GitHub Actions workflow.
  async create(req, res, next) {
    try {
      const { projectId, branch } = req.body || {};
      if (!projectId) return res.status(400).json({ error: 'projectId is required' });
      if (branch !== undefined && !BRANCH_RE.test(String(branch))) return res.status(400).json({ error: 'Invalid branch name' });
      const scan = await ScanService.startScan({ userId: req.user.id, projectId, branch });
      res.status(201).json({ scan: serializeScan(scan) });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const scan = await ScanModel.findByIdForUser(req.params.id, req.user.id);
      if (!scan) return res.status(404).json({ error: 'Scan not found' });
      res.json({ scan: serializeScan(scan) });
    } catch (err) {
      next(err);
    }
  },

  async listByProject(req, res, next) {
    try {
      const project = await ProjectModel.findByIdForUser(req.params.projectId, req.user.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const scans = await ScanModel.findAllByProject(project.id);
      res.json({ scans: scans.map(serializeScan) });
    } catch (err) {
      next(err);
    }
  },

  async history(req, res, next) {
    try {
      const scans = await ScanModel.findHistoryForUser(req.user.id);
      res.json({ scans: scans.map(serializeScan) });
    } catch (err) {
      next(err);
    }
  },

  // ---- called by the GitHub Actions scan workflow (x-scan-auth) --------
  async start(req, res, next) {
    try {
      const { runUrl, commitSha } = req.body || {};
      const scan = await ScanModel.markRunning(req.scan.id, { runUrl, commitSha });
      if (!scan) return res.status(409).json({ error: 'This scan is already finished' });
      res.json({ scan: serializeScan(scan) });
    } catch (err) {
      next(err);
    }
  },

  async source(req, res, next) {
    try {
      res.json(await ScanService.getSource(req.scan));
    } catch (err) {
      next(err);
    }
  },

  async submitResults(req, res, next) {
    try {
      const { vulnerabilities, scanners, gate, commitSha } = req.body || {};
      const result = await ScanService.submitScanResults({
        scan: req.scan,
        vulnerabilities,
        scanners,
        gate,
        commitSha,
      });
      res.json({
        scan: serializeScan(result.scan),
        severityCounts: result.severityCounts,
        final: { status: result.gate.status, reasons: result.gate.reasons },
        deploy: result.deploy,
        deployment: { id: result.deployment.id, status: result.deployment.status },
      });
    } catch (err) {
      next(err);
    }
  },

  async deployment(req, res, next) {
    try {
      const { status, url, logs } = req.body || {};
      const deployment = await ScanService.recordDeployment({ scan: req.scan, status, url, logs });
      res.json({ deployment: { id: deployment.id, status: deployment.status, url: deployment.url } });
    } catch (err) {
      next(err);
    }
  },

  async fail(req, res, next) {
    try {
      const scan = await ScanModel.markFailed(req.scan.id, (req.body && req.body.message) || 'Scan workflow failed');
      res.json({ scan: scan ? serializeScan(scan) : serializeScan(req.scan) });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = ScanController;
