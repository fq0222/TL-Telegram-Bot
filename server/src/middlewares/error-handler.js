/**
 * 概述：集中处理服务端异常，统一日志输出与错误响应格式。
 */
const { createLogger } = require('../utils/logger');
const { fail } = require('../utils/response');

const logger = createLogger('ErrorHandler');

/**
 * 错误处理中间件。
 * @param {Error & {statusCode?: number, details?: unknown}} error - 上游抛出的错误对象，可携带状态码和附加信息。
 * @param {import('express').Request} req - 当前请求对象，用于记录出错接口位置。
 * @param {import('express').Response} res - 当前响应对象，用于输出统一错误结构。
 * @param {import('express').NextFunction} _next - 保留 Express 错误处理中间件签名。
 */
function errorHandler(error, req, res, _next) {
  const statusCode = error.statusCode || 500;
  const isTrustedError = error.expose === true || statusCode < 500;
  const publicMessage = isTrustedError ? (error.message || '请求处理失败') : '服务器内部错误';
  const publicDetails = isTrustedError ? (error.details || null) : null;
  const logMessage = error.message || '服务器内部错误';
  const detailText = error.details ? `，details=${JSON.stringify(error.details)}` : '';

  logger.error(`请求失败 ${req.method} ${req.originalUrl} ${statusCode} - ${logMessage}${detailText}`);
  res.status(statusCode).json(fail(statusCode, publicMessage, publicDetails));
}

module.exports = {
  errorHandler
};
