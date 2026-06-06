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
 * 默认配置服务占位实现。
 */
class FallbackConfigService {
  /**
   * 创建默认配置服务。
   * 核心分支语义：仅用于未显式注入 configService 的轻量路由场景，不承担持久化职责。
   */
  constructor() {
    this.saveConfigs = this.saveConfigs.bind(this);
    this.getConfigs = this.getConfigs.bind(this);
  }

  /**
   * 保存配置占位方法。
   * @returns {Promise<[]>} 固定返回空保存结果。
   */
  async saveConfigs() {
    return [];
  }

  /**
   * 读取配置占位方法。
   * @param {string[]} keys - 待读取配置键列表。
   * @returns {Promise<Record<string, string>>} 空值配置快照。
   */
  async getConfigs(keys) {
    return keys.reduce((result, key) => {
      result[key] = '';
      return result;
    }, {});
  }
}

/**
 * 管理端路由自建认证服务时使用的内存会话仓储。
 */
class InMemorySessionRepository {
  /**
   * 创建内存会话仓储。
   * 核心分支语义：仅在测试或轻量默认路由缺少持久化 sessionRepository 时兜底，生产 runtime 会注入 SQLite 仓储。
   */
  constructor() {
    this.sessions = new Map();

    this.saveSession = this.saveSession.bind(this);
    this.getSession = this.getSession.bind(this);
  }

  /**
   * 保存会话。
   * @param {{ sessionId: string, adminId: string, status: string, payloadJson?: string, expiresAt?: string }} session - 会话记录。
   * @returns {Promise<object>} 已保存的会话记录。
   */
  async saveSession(session) {
    this.sessions.set(session.sessionId, { ...session });
    return { ...session };
  }

  /**
   * 读取会话。
   * @param {string} sessionId - 会话 ID。
   * @returns {Promise<object | null>} 会话记录或空值。
   */
  async getSession(sessionId) {
    const session = this.sessions.get(sessionId);

    return session ? { ...session } : null;
  }
}

/**
 * 创建默认配置服务占位实现的迁移期兼容包装。
 * @returns {FallbackConfigService} 默认配置服务。
 */
function createFallbackConfigService() {
  return new FallbackConfigService();
}

/**
 * 管理员路由对象。
 */
class AdminRoutes {
  /**
   * 创建管理员路由实例。
   * 核心分支语义：优先使用外部注入依赖；未注入时只创建轻量默认服务，避免路由层隐式创建数据库连接。
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
   */
  constructor(options = {}) {
    this.expressLib = options.expressLib || require('express');
    this.router = this.expressLib.Router();
    this.configService = options.configService || new FallbackConfigService();
    this.sessionRepository = options.sessionRepository || (options.authService ? null : new InMemorySessionRepository());
    this.loginAttemptService = options.loginAttemptService || createAdminLoginAttemptService();
    this.authService =
      options.authService ||
      createAdminAuthService({
        devAuth: options.devAuth,
        configService: this.configService,
        sessionRepository: this.sessionRepository
      });
    this.certificateService =
      options.certificateService || createCertificateService(resolveCertificateServiceOptions());
    this.telegramApiService =
      options.telegramApiService ||
      createTelegramApiService({
        configService: this.configService,
        fetchImpl: global.fetch
      });
    this.adminAuthController = createAdminAuthController({
      authService: this.authService,
      loginAttemptService: this.loginAttemptService
    });
    this.adminConfigController = createAdminConfigController({ configService: this.configService });
    this.certificateController = createCertificateController({
      certificateService: this.certificateService,
      configService: this.configService
    });
    this.statusController = createStatusController({
      configService: this.configService,
      telegramApiService: this.telegramApiService
    });
    this.adminAuthMiddleware = createAdminAuthMiddleware({ authService: this.authService });

    this.getRouter = this.getRouter.bind(this);
    this.registerRoutes();
  }

  /**
   * 注册管理端路由处理器。
   * @returns {void}
   */
  registerRoutes() {
    this.router.post('/auth/login', this.adminAuthController.login);
    this.router.get('/auth/credentials', this.adminAuthMiddleware, this.adminAuthController.getCredentials);
    this.router.put('/auth/credentials', this.adminAuthMiddleware, this.adminAuthController.updateCredentials);
    this.router.get('/config', this.adminAuthMiddleware, this.adminConfigController.getConfig);
    this.router.put('/config', this.adminAuthMiddleware, this.adminConfigController.saveConfig);
    this.router.get('/certificates/status', this.adminAuthMiddleware, this.certificateController.getCertificateStatus);
    this.router.get('/certificates/domains', this.adminAuthMiddleware, this.certificateController.listDomains);
    this.router.post('/certificates/select', this.adminAuthMiddleware, this.certificateController.selectDomain);
    this.router.get('/status', this.adminAuthMiddleware, this.statusController.getStatus);
    this.router.get('/status/overview', this.adminAuthMiddleware, this.statusController.getOverview);
    this.router.post('/webhook/register', this.adminAuthMiddleware, this.statusController.registerWebhook);
  }

  /**
   * 返回 Express Router 实例。
   * @returns {import('express').Router | {post: Function, get: Function, put: Function}} 管理员路由实例。
   */
  getRouter() {
    return this.router;
  }
}

/**
 * 创建管理员路由的迁移期兼容包装。
 * @param {ConstructorParameters<typeof AdminRoutes>[0]} [options] - 路由依赖。
 * @returns {import('express').Router | {post: Function, get: Function, put: Function}} 管理员路由实例。
 */
function createAdminRoutes(options = {}) {
  return new AdminRoutes(options).getRouter();
}

module.exports = {
  AdminRoutes,
  FallbackConfigService,
  InMemorySessionRepository,
  createAdminRoutes,
  createFallbackConfigService,
  resolveCertificateServiceOptions
};
