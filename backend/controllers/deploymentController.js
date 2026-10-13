const DeploymentModel = require('../models/deploymentModel');
const ProjectModel = require('../models/projectModel');
const { serializeDeployment } = require('../utils/serialize');

const DeploymentController = {
  async listAll(req, res, next) {
    try {
      const rows = await DeploymentModel.findAllForUser(req.user.id);
      res.json({ deployments: rows.map(serializeDeployment) });
    } catch (err) {
      next(err);
    }
  },

  async listByProject(req, res, next) {
    try {
      const project = await ProjectModel.findByIdForUser(req.params.projectId, req.user.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const rows = await DeploymentModel.findByProject(project.id);
      res.json({ deployments: rows.map(serializeDeployment) });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = DeploymentController;
