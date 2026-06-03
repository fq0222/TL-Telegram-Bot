/**
 * 概述：聚合管理员认证与配置相关路由，当前提供最小登录与配置读取接口，并确保配置接口默认走鉴权。
 */
const { createAdminAuthController } = require('../controllers/admin-auth-controller');
const { createAdminConfigController } = require('../controllers/admin-config-controller');
const { createCertificateController } = require('../controllers/certificate-controller');
const { createStatusController } = require('../controllers/status-controller');
const { createAdminAuthMiddleware } = require('../middlewares/admin-auth-middleware');
const { createAdminAuthService } = require('../services/admin-auth-service');

/**
 * 创建管理员路由。
 * 核心分支语义：登录接口始终匿名可访问；配置读取接口必须经过管理员鉴权中间件，保持最小安全边界。
 * @param {{ expressLib?: Function & { Router?: Function }, authService?: { login: Function, verifyToken: Function } }} [options] - 路由依赖。
 * @returns {import('express').Router | {post: Function, get: Function}} 管理员路由实例。
 */
function createAdminRoutes(options = {}) {
  const expressLib = options.expressLib || require('express');
  const router = expressLib.Router();
  const authService = options.authService || createAdminAuthService({ devAuth: options.devAuth });
  const adminAuthController = createAdminAuthController({ authService });
  const adminConfigController = createAdminConfigController();
  const certificateController = createCertificateController();
  const statusController = createStatusController();
  const adminAuthMiddleware = createAdminAuthMiddleware({ authService });

  router.post('/auth/login', adminAuthController.login);
  router.get('/config', adminAuthMiddleware, adminConfigController.getConfig);
  router.get('/certificates/status', adminAuthMiddleware, certificateController.getCertificateStatus);
  router.get('/status', adminAuthMiddleware, statusController.getStatus);

  return router;
}

module.exports = {
  createAdminRoutes
};
