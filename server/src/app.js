/**
 * 概述：创建服务端最小 Express 应用，挂载 JSON 解析、请求日志、管理员路由、健康检查和兜底中间件。
 */
const { requestLogger } = require('./middlewares/request-logger');
const { notFoundHandler } = require('./middlewares/not-found-handler');
const { errorHandler } = require('./middlewares/error-handler');
const { createLogger } = require('./utils/logger');
const { ok } = require('./utils/response');

const logger = createLogger('App');

/**
 * 创建 Express 应用实例。
 * 核心分支语义：默认惰性加载真实 express 与管理员路由；测试可通过 options 注入 expressLib 与 adminRoutes，避免依赖外部安装状态。
 * @param {{ expressLib?: Function & { json?: Function }, adminRoutes?: unknown }} [options] - 应用依赖注入项。
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
  const app = expressLib();

  logger.info('开始创建 Express 应用实例');
  app.use(expressLib.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.use('/api/admin', adminRoutes);

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
