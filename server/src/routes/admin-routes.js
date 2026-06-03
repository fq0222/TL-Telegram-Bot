/**
 * 概述：聚合管理员认证与配置相关路由，当前提供最小登录与配置读取接口，并确保配置接口默认走鉴权。
 */
const { createAdminAuthController } = require('../controllers/admin-auth-controller');
const { createAdminConfigController } = require('../controllers/admin-config-controller');
const { createCertificateController } = require('../controllers/certificate-controller');
const { createStatusController } = require('../controllers/status-controller');
const { createAdminAuthMiddleware } = require('../middlewares/admin-auth-middleware');
const { createAdminAuthService } = require('../services/admin-auth-service');
const { createConfigService } = require('../services/config-service');
const { createConfigRepository } = require('../repositories/config-repository');
const { createDatabase } = require('../config/database');
const { createCertificateService } = require('../services/certificate-service');
const { createTelegramApiService } = require('../services/telegram-api-service');

let runtimeAdminServices = null;

/**
 * 创建运行期管理员依赖。
 * 核心分支语义：优先初始化 SQLite 配置服务；若初始化失败，则回退到最小空实现，避免开发环境直接因配置层未就绪而阻断路由加载。
 * @returns {{
 *   configService: { getConfigs: Function, saveConfigs: Function },
 *   certificateService: { listDomains: Function, activateDomain: Function },
 *   telegramApiService: { setWebhook: Function }
 * }} 运行期依赖集合。
 */
function getRuntimeAdminServices() {
  if (runtimeAdminServices) {
    return runtimeAdminServices;
  }

  try {
    const database = createDatabase();
    const configRepository = createConfigRepository({ database });

    runtimeAdminServices = {
      configService: createConfigService({ repository: configRepository }),
      certificateService: createCertificateService(),
      telegramApiService: createTelegramApiService({
        botToken: process.env.TELEGRAM_BOT_TOKEN
      })
    };
  } catch (_error) {
    runtimeAdminServices = {
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
      certificateService: createCertificateService(),
      telegramApiService: createTelegramApiService({
        botToken: process.env.TELEGRAM_BOT_TOKEN
      })
    };
  }

  return runtimeAdminServices;
}

/**
 * 创建管理员路由。
 * 核心分支语义：登录接口始终匿名可访问；配置读取接口必须经过管理员鉴权中间件，保持最小安全边界。
 * @param {{ expressLib?: Function & { Router?: Function }, authService?: { login: Function, verifyToken: Function }, configService?: { getConfigs: Function, saveConfigs: Function }, certificateService?: { listDomains: Function, activateDomain: Function }, telegramApiService?: { setWebhook: Function } }} [options] - 路由依赖。
 * @returns {import('express').Router | {post: Function, get: Function}} 管理员路由实例。
 */
function createAdminRoutes(options = {}) {
  const expressLib = options.expressLib || require('express');
  const router = expressLib.Router();
  const runtimeServices = getRuntimeAdminServices();
  const authService = options.authService || createAdminAuthService({ devAuth: options.devAuth });
  const adminAuthController = createAdminAuthController({ authService });
  const configService = options.configService || runtimeServices.configService;
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
  createAdminRoutes
};
