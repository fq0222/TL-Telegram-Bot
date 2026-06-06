/**
 * 概述：创建服务端 Express 应用，
 * 统一挂载隐藏管理端入口、Webhook 路由、静态资源与兜底中间件。
 */
const path = require('path');
const { requestLogger } = require('./middlewares/request-logger');
const { notFoundHandler } = require('./middlewares/not-found-handler');
const { errorHandler } = require('./middlewares/error-handler');
const { createLogger } = require('./utils/logger');
const { ok } = require('./utils/response');
const { WebhookRoutes } = require('./routes/webhook-routes');
const { AdminRoutes } = require('./routes/admin-routes');
const { createTelegramCommandService } = require('./services/telegram-command-service');

const logger = createLogger('App');
const adminSpaEntryPath = path.resolve(__dirname, '../../web/dist/index.html');

/**
 * 规范化管理员隐藏访问路径。
 * @param {string | undefined} value - 原始配置值。
 * @returns {string} 32 位字母数字组成的路径片段；非法时返回空字符串。
 */
function normalizeAdminAccessPath(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  return /^[a-zA-Z0-9]{32}$/.test(normalizedValue) ? normalizedValue : '';
}

/**
 * 解析管理员 SPA 的访问基础路径。
 * @param {string | undefined} adminAccessPath - 32 位隐藏路径片段。
 * @returns {string} 用于前端 history 的基础路径。
 */
function resolveAdminSpaBasePath(adminAccessPath) {
  const normalizedAccessPath = normalizeAdminAccessPath(adminAccessPath);

  return normalizedAccessPath ? `/${normalizedAccessPath}` : '';
}

/**
 * 解析管理员 API 的挂载路径。
 * @param {string | undefined} adminAccessPath - 32 位隐藏路径片段。
 * @returns {string} 管理员 API 挂载路径。
 */
function resolveAdminApiMountPath(adminAccessPath) {
  const adminBasePath = resolveAdminSpaBasePath(adminAccessPath);

  return adminBasePath ? `${adminBasePath}/api/admin` : '/api/admin';
}

/**
 * 判断当前请求是否应该回退到管理员前端单页入口。
 * @param {import('express').Request} req - Express 请求对象。
 * @param {string} adminBasePath - 管理员前端基础路径。
 * @returns {boolean} 是否应该回退到前端单页入口。
 */
function shouldServeAdminSpa(req, adminBasePath) {
  const acceptHeader = typeof req.headers.accept === 'string' ? req.headers.accept : '';
  const requestPath = req.originalUrl || '';

  if (req.method !== 'GET') {
    return false;
  }

  if (!acceptHeader.includes('text/html')) {
    return false;
  }

  if (requestPath === '/healthz' || requestPath.startsWith('/telegram/') || /\.[a-z0-9]+$/i.test(requestPath)) {
    return false;
  }

  if (!adminBasePath) {
    return !requestPath.startsWith('/api/');
  }

  if (!requestPath.startsWith(adminBasePath)) {
    return false;
  }

  return !requestPath.startsWith(`${adminBasePath}/api/`);
}

/**
 * Express 应用构建器，集中表达应用挂载生命周期。
 */
class AppBuilder {
  /**
   * 创建应用构建器。
   * 核心分支语义：优先使用注入路由与命令服务；未注入时创建轻量默认依赖，避免应用层隐式重复建库。
   * @param {{
   *   expressLib?: Function & { json?: Function, static?: Function },
   *   adminRoutes?: unknown,
   *   webhookRoutes?: unknown,
   *   commandService?: { handleUpdate: Function },
   *   devAuth?: { token?: string, adminId?: string, sessionId?: string, tokenType?: string },
   *   adminAccessPath?: string
   * }} [options] - 应用依赖注入项。
   */
  constructor(options = {}) {
    this.options = options;
    this.expressLib = options.expressLib || require('express');
    this.adminAccessPath = normalizeAdminAccessPath(options.adminAccessPath || process.env.ADMIN_ACCESS_PATH);
    this.adminBasePath = resolveAdminSpaBasePath(this.adminAccessPath);
    this.adminApiMountPath = resolveAdminApiMountPath(this.adminAccessPath);

    this.build = this.build.bind(this);
    this.handleAdminSpaFallback = this.handleAdminSpaFallback.bind(this);
    this.handleHealthz = this.handleHealthz.bind(this);
  }

  /**
   * 构建并配置 Express 应用实例。
   * @returns {import('express').Express | {use: Function, get: Function}} 配置好的应用实例。
   */
  build() {
    const commandService = this.options.commandService || createTelegramCommandService();
    const adminRoutes =
      this.options.adminRoutes ||
      new AdminRoutes({
        expressLib: this.expressLib
      }).getRouter();
    const webhookRoutes =
      this.options.webhookRoutes ||
      new WebhookRoutes({
        expressLib: this.expressLib,
        commandService
      }).getRouter();
    const app = this.expressLib();

    logger.info(`开始创建 Express 应用实例 adminApiMountPath=${this.adminApiMountPath}`);
    app.use(this.expressLib.json({ limit: '1mb' }));
    app.use(requestLogger);
    app.use(this.adminApiMountPath, adminRoutes);
    app.use('/telegram', webhookRoutes);
    if (typeof this.expressLib.static === 'function') {
      app.use(this.expressLib.static(path.resolve(__dirname, '../../web/dist')));
    }
    app.get('*', this.handleAdminSpaFallback);
    app.get('/healthz', this.handleHealthz);
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
  }

  /**
   * 处理管理员 SPA 兜底入口。
   * @param {import('express').Request} req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @param {import('express').NextFunction} next - Express 下一个中间件。
   * @returns {void}
   */
  handleAdminSpaFallback(req, res, next) {
    if (!shouldServeAdminSpa(req, this.adminBasePath) || typeof res.sendFile !== 'function') {
      next();
      return;
    }

    logger.info(`回退到管理员前端入口 path=${req.originalUrl}`);
    res.sendFile(adminSpaEntryPath);
  }

  /**
   * 返回健康检查响应。
   * @param {import('express').Request} _req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {void}
   */
  handleHealthz(_req, res) {
    res.json(ok({ service: 'tl-telegram-bot' }));
  }
}

/**
 * 创建 Express 应用实例的迁移期兼容包装。
 * @param {ConstructorParameters<typeof AppBuilder>[0]} [options] - 应用依赖注入项。
 * @returns {import('express').Express | {use: Function, get: Function}} 配置好的应用实例。
 */
function createApp(options = {}) {
  return new AppBuilder(options).build();
}

module.exports = {
  AppBuilder,
  createApp,
  normalizeAdminAccessPath,
  resolveAdminApiMountPath,
  resolveAdminSpaBasePath,
  shouldServeAdminSpa
};
