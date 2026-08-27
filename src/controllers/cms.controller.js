const cmsService = require('../services/cms.service');
const { sendSuccess } = require('../utils/response');

/* ------------------------------ Sections ---------------------------------- */

async function listSections(req, res, next) {
  try {
    const sections = await cmsService.listAllSections();
    return sendSuccess(res, { data: { sections }, message: 'Sections retrieved' });
  } catch (error) {
    return next(error);
  }
}

async function createSection(req, res, next) {
  try {
    const section = await cmsService.createSection(req.body);
    return sendSuccess(res, { status: 201, data: { section }, message: 'Section created' });
  } catch (error) {
    return next(error);
  }
}

async function updateSection(req, res, next) {
  try {
    const section = await cmsService.updateSection(req.params.id, req.body);
    return sendSuccess(res, { data: { section }, message: 'Section updated' });
  } catch (error) {
    return next(error);
  }
}

async function deleteSection(req, res, next) {
  try {
    await cmsService.deleteSection(req.params.id);
    return sendSuccess(res, { message: 'Section deleted' });
  } catch (error) {
    return next(error);
  }
}

/* ------------------------------ Pages ------------------------------------- */

async function listPages(req, res, next) {
  try {
    const includeInactive = req.user?.role === 'ADMIN' && req.query.includeInactive === 'true';
    const pages = await cmsService.listPages({ includeInactive });
    return sendSuccess(res, { data: { pages }, message: 'Pages retrieved' });
  } catch (error) {
    return next(error);
  }
}

async function createPage(req, res, next) {
  try {
    const page = await cmsService.createPage(req.body);
    return sendSuccess(res, { status: 201, data: { page }, message: 'Page created' });
  } catch (error) {
    return next(error);
  }
}

async function updatePage(req, res, next) {
  try {
    const page = await cmsService.updatePage(req.params.id, req.body);
    return sendSuccess(res, { data: { page }, message: 'Page updated' });
  } catch (error) {
    return next(error);
  }
}

async function deletePage(req, res, next) {
  try {
    await cmsService.deletePage(req.params.id);
    return sendSuccess(res, { message: 'Page deleted' });
  } catch (error) {
    return next(error);
  }
}

/* ------------------------------ Menus ------------------------------------- */

async function getMenu(req, res, next) {
  try {
    const menu = await cmsService.getMenu(req.params.location);
    return sendSuccess(res, { data: { menu }, message: 'Menu retrieved' });
  } catch (error) {
    return next(error);
  }
}

async function updateMenu(req, res, next) {
  try {
    const menu = await cmsService.updateMenu(req.params.location, req.body.items);
    return sendSuccess(res, { data: { menu }, message: 'Menu updated' });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listSections,
  createSection,
  updateSection,
  deleteSection,
  listPages,
  createPage,
  updatePage,
  deletePage,
  getMenu,
  updateMenu,
};
