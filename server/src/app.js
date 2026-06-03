/**
 * 概述：创建服务端最小 Express 应用，挂载 JSON 解析、请求日志、健康检查和兜底中间件。
 */
const express = require('express');
const { requestLogger } = require('./middlewares/request-logger');
const { notFoundHandler } = require('./middlewares/not-found-handler');
const { errorHandler } = require('./middlewares/error-handler');
const { createLogger } = require('./utils/logger');
const { ok } = require('./utils/response');

const logger = createLogger('App');

/**
 * 创建 Express 应用实例。
 * @returns {import('express').Express} 配置好基础中间件的 Express 应用。
 */
function createApp() {
  const app = express();

  logger.info('开始创建 Express 应用实例');
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

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
