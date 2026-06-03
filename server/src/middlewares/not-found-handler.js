/**
 * 概述：兜底处理未命中的请求路径，将其转为统一的 404 HTTP 错误。
 */
const { HttpError } = require('../utils/http-error');

/**
 * 404 处理中间件。
 * @param {import('express').Request} req - 当前请求对象，用于拼接未命中的路径提示。
 * @param {import('express').Response} _res - 未直接使用的响应对象，保留 Express 中间件签名。
 * @param {import('express').NextFunction} next - 继续交给错误处理中间件输出统一响应。
 */
function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `未找到请求路径: ${req.method} ${req.originalUrl}`));
}

module.exports = {
  notFoundHandler
};
