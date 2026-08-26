const attributeService = require('../services/attribute.service');
const { sendSuccess } = require('../utils/response');

class AttributeController {
  async list(req, res, next) {
    try {
      const attributes = await attributeService.list(req.query);
      return sendSuccess(res, {
        data: { attributes },
        message: 'Attributes retrieved',
      });
    } catch (error) {
      return next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const attribute = await attributeService.getById(req.params.id);
      return sendSuccess(res, {
        data: { attribute },
        message: 'Attribute details',
      });
    } catch (error) {
      return next(error);
    }
  }

  async create(req, res, next) {
    try {
      const attribute = await attributeService.create(req.body);
      return sendSuccess(res, {
        status: 201,
        data: { attribute },
        message: `Attribute "${attribute.name}" created`,
      });
    } catch (error) {
      return next(error);
    }
  }

  async update(req, res, next) {
    try {
      const attribute = await attributeService.update(req.params.id, req.body);
      return sendSuccess(res, {
        data: { attribute },
        message: `Attribute "${attribute.name}" updated`,
      });
    } catch (error) {
      return next(error);
    }
  }

  async remove(req, res, next) {
    try {
      const result = await attributeService.remove(req.params.id);
      return sendSuccess(res, {
        data: result,
        message: result.message,
      });
    } catch (error) {
      return next(error);
    }
  }

  async addOption(req, res, next) {
    try {
      const attribute = await attributeService.addOption(req.params.id, req.body);
      return sendSuccess(res, {
        data: { attribute },
        message: 'Option added to attribute',
      });
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new AttributeController();

