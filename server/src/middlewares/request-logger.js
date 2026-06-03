/**
 * 概述：记录请求进入与响应完成日志，帮助后续排查接口访问路径和耗时。
 */
const { createLogger } = require('../utils/logger');

const logger = createLogger('RequestLogger');

/**
 * 请求日志中间件。
 * @param {import('express').Request} req - 当前请求对象，提供方法、路径和请求头信息。
 * @param {import('express').Response} res - 当前响应对象，用于监听响应完成事件。
 * @param {import('express').NextFunction} next - 继续执行后续中间件或路由。
 */
function requestLogger(req, res, next) {
  const startAt = Date.now();
  logger.info(`收到请求 ${req.method} ${req.originalUrl}`);

  res.on('finish', () => {
    const duration = Date.now() - startAt;
    logger.info(`完成请求 ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });

  next();
}

module.exports = {
  requestLogger
};
