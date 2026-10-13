const ProjectModel = require('../models/projectModel');
const GithubService = require('../services/githubService');
const { resolveConfig, DEFAULTS } = require('../services/securityScoreService');
const { NAME_RE, BRANCH_RE } = require('./githubController');
const { serializeProject } = require('../utils/serialize');

const ProjectController = {
  // A project is created from a GitHub repository the user can access.
  async create(req, res, next) {
    try {
      const { owner, repo } = req.body || {};
      if (!NAME_RE.test(String(owner || '')) || !NAME_RE.test(String(repo || ''))) {
        return res.status(400).json({ error: 'owner and repo are required' });
      }
      // Proves the connected GitHub token can really see this repository.
      const info = await GithubService.getRepo(req.user.id, owner, repo);
      const branch = String((req.body && req.body.branch) || info.defaultBranch);
      if (!BRANCH_RE.test(branch)) return res.status(400).json({ error: 'Invalid branch name' });

      const project = await ProjectModel.create({
        userId: req.user.id,
        name: info.name,
        githubOwner: info.owner,
        githubRepo: info.name,
        branch,
        githubRepoUrl: info.url,
      });
      const full = await ProjectModel.findByIdForUser(project.id, req.user.id);
      res.status(201).json({ project: serializeProject(full) });
    } catch (err) {
      next(err);
    }
  },

  async list(req, res, next) {
    try {
      const projects = await ProjectModel.findAllByUser(req.user.id);
      res.json({ projects: projects.map(serializeProject) });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const project = await ProjectModel.findByIdForUser(req.params.id, req.user.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json({ project: serializeProject(project) });
    } catch (err) {
      next(err);
    }
  },

  // Configurable security gate: the user edits the rules that decide PASS/FAIL.
  async updateSettings(req, res, next) {
    try {
      const existing = await ProjectModel.findByIdForUser(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: 'Project not found' });

      const body = req.body || {};
      let gateConfig;
      if (body.gate !== undefined) {
        // Merge over what is saved now so a partial update keeps the other rules.
        const current = resolveConfig(existing.gate_config);
        gateConfig = resolveConfig({ gate: { ...current.gate, ...body.gate } });
      }
      if (body.deployEnabled !== undefined && typeof body.deployEnabled !== 'boolean') {
        return res.status(400).json({ error: 'deployEnabled must be true or false' });
      }

      await ProjectModel.updateSettings(existing.id, {
        gateConfig: gateConfig && { gate: gateConfig.gate },
        deployEnabled: body.deployEnabled,
      });
      const full = await ProjectModel.findByIdForUser(existing.id, req.user.id);
      res.json({ project: serializeProject(full) });
    } catch (err) {
      next(err);
    }
  },

  async defaults(req, res) {
    res.json({ gate: DEFAULTS.gate, weights: DEFAULTS.scoring.weights });
  },

  async remove(req, res, next) {
    try {
      const ok = await ProjectModel.remove(req.params.id, req.user.id);
      if (!ok) return res.status(404).json({ error: 'Project not found' });
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = ProjectController;
