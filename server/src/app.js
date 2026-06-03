/**
 * 概述：创建服务端最小 Express 应用，挂载 JSON 解析、请求日志、管理员路由、健康检查和兜底中间件。
 */
const path = require('path');
const { requestLogger } = require('./middlewares/request-logger');
const { notFoundHandler } = require('./middlewares/not-found-handler');
const { errorHandler } = require('./middlewares/error-handler');
const { createLogger } = require('./utils/logger');
const { ok } = require('./utils/response');
const { createWebhookRoutes } = require('./routes/webhook-routes');

const logger = createLogger('App');

/**
 * 创建 Express 应用实例。
 * 核心分支语义：默认惰性加载真实 express、管理员路由与 webhook 路由；测试可通过 options 注入依赖，避免依赖外部安装状态。
 * @param {{ expressLib?: Function & { json?: Function }, adminRoutes?: unknown, webhookRoutes?: unknown, commandService?: { handleUpdate: Function }, devAuth?: { token?: string, adminId?: string, sessionId?: string, tokenType?: string } }} [options] - 应用依赖注入项。
 * @returns {import('express').Express | {use: Function, get: Function}} 配置好的应用实例。
 */
function createApp(options = {}) {
  const expressLib = options.expressLib || require('express');
  const adminRoutes =
    options.adminRoutes ||
    require('./routes/admin-routes').createAdminRoutes({
      expressLib,
      devAuth: options.devAuth
    });
  const webhookRoutes =
    options.webhookRoutes ||
    createWebhookRoutes({
      expressLib,
      commandService: options.commandService
    });
  const app = expressLib();

  logger.info('开始创建 Express 应用实例');
  app.use(expressLib.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.use('/api/admin', adminRoutes);
  app.use('/telegram', webhookRoutes);
  if (typeof expressLib.static === 'function') {
    app.use(expressLib.static(path.resolve(__dirname, '../../web/dist')));
  }

  /**
   * 健康检查接口，用于确认最小服务已成功启动。
   * 成功分支固定返回统一响应结构，便于后续探针和联调复用。
   */
  app.get('/healthz', (_req, res) => {
    res.json(ok({ service: 'tl-telegram-bot' }));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp
};
