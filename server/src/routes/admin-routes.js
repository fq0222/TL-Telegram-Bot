/**
 * 概述：聚合管理员认证与配置相关路由，
 * 统一注入认证、登录冷却、证书与 Telegram 状态依赖，保持管理端入口清晰稳定。
 */
const { createAdminAuthController } = require('../controllers/admin-auth-controller');
const { createAdminConfigController } = require('../controllers/admin-config-controller');
const { createCertificateController } = require('../controllers/certificate-controller');
const { createStatusController } = require('../controllers/status-controller');
const { createAdminAuthMiddleware } = require('../middlewares/admin-auth-middleware');
const { createAdminAuthService } = require('../services/admin-auth-service');
const { createAdminLoginAttemptService } = require('../services/admin-login-attempt-service');
const { createCertificateService } = require('../services/certificate-service');
const { createTelegramApiService } = require('../services/telegram-api-service');

/**
 * 读取证书服务所需的目录配置。
 * @returns {{ acmeBasePath?: string, tlsRootPath?: string }} 仅在存在有效配置时返回对应字段。
 */
function resolveCertificateServiceOptions() {
  const options = {};

  if (typeof process.env.ACME_BASE_PATH === 'string' && process.env.ACME_BASE_PATH.trim()) {
    options.acmeBasePath = process.env.ACME_BASE_PATH.trim();
  }

  if (typeof process.env.TLS_TARGET_BASE_PATH === 'string' && process.env.TLS_TARGET_BASE_PATH.trim()) {
    options.tlsRootPath = process.env.TLS_TARGET_BASE_PATH.trim();
  }

  return options;
}

/**
 * 创建默认配置服务占位实现。
 * @returns {{ saveConfigs: Function, getConfigs: Function }} 默认配置服务。
 */
function createFallbackConfigService() {
  return {
    async saveConfigs() {
      return [];
    },
    async getConfigs(keys) {
      return keys.reduce((result, key) => {
        result[key] = '';
        return result;
      }, {});
    }
  };
}

/**
 * 创建管理员路由。
 * 核心分支语义：优先使用外部注入依赖；未注入时仅创建轻量默认服务，
 * 避免在路由层再次隐式创建数据库连接。
 * @param {{
 *   expressLib?: Function & { Router?: Function },
 *   authService?: { login: Function, verifyToken: Function, getCredentialProfile?: Function, updateCredentials?: Function },
 *   loginAttemptService?: { assertAttemptAllowed?: Function, registerAttempt?: Function },
 *   configService?: { getConfigs: Function, saveConfigs: Function },
 *   sessionRepository?: { saveSession: Function, getSession: Function } | null,
 *   certificateService?: { listDomains: Function, activateDomain: Function },
 *   telegramApiService?: { setWebhook: Function, getWebhookInfo: Function },
 *   devAuth?: { token?: string, adminId?: string, sessionId?: string, tokenType?: string }
 * }} [options] - 路由依赖。
 * @returns {import('express').Router | {post: Function, get: Function, put: Function}} 管理员路由实例。
 */
function createAdminRoutes(options = {}) {
  const expressLib = options.expressLib || require('express');
  const router = expressLib.Router();
  const configService = options.configService || createFallbackConfigService();
  const sessionRepository = options.sessionRepository || null;
  const loginAttemptService = options.loginAttemptService || createAdminLoginAttemptService();
  const authService =
    options.authService ||
    createAdminAuthService({
      devAuth: options.devAuth,
      configService,
      sessionRepository
    });
  const certificateService = options.certificateService || createCertificateService(resolveCertificateServiceOptions());
  const telegramApiService =
    options.telegramApiService ||
    createTelegramApiService({
      configService,
      fetchImpl: global.fetch
    });
  const adminAuthController = createAdminAuthController({
    authService,
    loginAttemptService
  });
  const adminConfigController = createAdminConfigController({ configService });
  const certificateController = createCertificateController({
    certificateService,
    configService
  });
  const statusController = createStatusController({
    configService,
    telegramApiService
  });
  const adminAuthMiddleware = createAdminAuthMiddleware({ authService });

  router.post('/auth/login', adminAuthController.login);
  router.get('/auth/credentials', adminAuthMiddleware, adminAuthController.getCredentials);
  router.put('/auth/credentials', adminAuthMiddleware, adminAuthController.updateCredentials);
  router.get('/config', adminAuthMiddleware, adminConfigController.getConfig);
  router.put('/config', adminAuthMiddleware, adminConfigController.saveConfig);
  router.get('/certificates/status', adminAuthMiddleware, certificateController.getCertificateStatus);
  router.get('/certificates/domains', adminAuthMiddleware, certificateController.listDomains);
  router.post('/certificates/select', adminAuthMiddleware, certificateController.selectDomain);
  router.get('/status', adminAuthMiddleware, statusController.getStatus);
  router.get('/status/overview', adminAuthMiddleware, statusController.getOverview);
  router.post('/webhook/register', adminAuthMiddleware, statusController.registerWebhook);

  return router;
}

module.exports = {
  createAdminRoutes,
  resolveCertificateServiceOptions
};
