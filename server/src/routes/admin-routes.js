/**
 * 概述：聚合管理员认证与配置相关路由，
 * 统一注入认证、登录冷却、证书与 Telegram 状态等依赖，保持管理端入口清晰稳定。
 */
const { createAdminAuthController } = require('../controllers/admin-auth-controller');
const { createAdminConfigController } = require('../controllers/admin-config-controller');
const { createCertificateController } = require('../controllers/certificate-controller');
const { createStatusController } = require('../controllers/status-controller');
const { createAdminAuthMiddleware } = require('../middlewares/admin-auth-middleware');
const { createAdminAuthService } = require('../services/admin-auth-service');
const { createAdminLoginAttemptService } = require('../services/admin-login-attempt-service');
const { createConfigService } = require('../services/config-service');
const { createConfigRepository } = require('../repositories/config-repository');
const { createSessionRepository } = require('../repositories/session-repository');
const { createDatabase } = require('../config/database');
const { createCertificateService } = require('../services/certificate-service');
const { createTelegramApiService } = require('../services/telegram-api-service');

let runtimeAdminServices = null;

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
 * 创建运行期管理员依赖。
 * @returns {{
 *   authService: { login: Function, verifyToken: Function, getCredentialProfile?: Function, updateCredentials?: Function },
 *   loginAttemptService: { assertAttemptAllowed: Function, registerAttempt: Function },
 *   configService: { getConfigs: Function, saveConfigs: Function },
 *   sessionRepository: { saveSession: Function, getSession: Function } | null,
 *   certificateService: { listDomains: Function, activateDomain: Function },
 *   telegramApiService: { setWebhook: Function, getWebhookInfo: Function }
 * }} 运行期依赖集合。
 */
function getRuntimeAdminServices() {
  if (runtimeAdminServices) {
    return runtimeAdminServices;
  }

  try {
    const database = createDatabase();
    const configRepository = createConfigRepository({ database });
    const sessionRepository = createSessionRepository({ database });
    const configService = createConfigService({ repository: configRepository });

    runtimeAdminServices = {
      configService,
      authService: null,
      loginAttemptService: createAdminLoginAttemptService(),
      sessionRepository,
      certificateService: createCertificateService(resolveCertificateServiceOptions()),
      telegramApiService: createTelegramApiService({
        configService,
        fetchImpl: global.fetch
      })
    };
    runtimeAdminServices.authService = createAdminAuthService({
      configService: runtimeAdminServices.configService,
      sessionRepository: runtimeAdminServices.sessionRepository
    });
  } catch (_error) {
    runtimeAdminServices = {
      authService: null,
      loginAttemptService: createAdminLoginAttemptService(),
      sessionRepository: null,
      configService: {
        async saveConfigs() {
          return [];
        },
        async getConfigs(keys) {
          return keys.reduce((result, key) => {
            result[key] = '';
            return result;
          }, {});
        }
      },
      certificateService: createCertificateService(resolveCertificateServiceOptions()),
      telegramApiService: createTelegramApiService({
        botToken: process.env.TELEGRAM_BOT_TOKEN
      })
    };
    runtimeAdminServices.authService = createAdminAuthService({
      configService: runtimeAdminServices.configService
    });
  }

  return runtimeAdminServices;
}

/**
 * 创建管理员路由。
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
 * @returns {import('express').Router | {post: Function, get: Function}} 管理员路由实例。
 */
function createAdminRoutes(options = {}) {
  const expressLib = options.expressLib || require('express');
  const router = expressLib.Router();
  const runtimeServices = getRuntimeAdminServices();
  const configService = options.configService || runtimeServices.configService;
  const sessionRepository = options.sessionRepository || runtimeServices.sessionRepository;
  const loginAttemptService =
    options.loginAttemptService ||
    (options.authService || options.devAuth
      ? createAdminLoginAttemptService()
      : runtimeServices.loginAttemptService);
  const authService =
    options.authService ||
    createAdminAuthService({
      devAuth: options.devAuth,
      configService,
      sessionRepository
    });
  const adminAuthController = createAdminAuthController({
    authService,
    loginAttemptService
  });
  const certificateService = options.certificateService || runtimeServices.certificateService;
  const telegramApiService = options.telegramApiService || runtimeServices.telegramApiService;
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
