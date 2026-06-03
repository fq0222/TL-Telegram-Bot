/**
 * 概述：提供管理员接口的最小鉴权中间件，负责解析 Bearer token、处理 401，并把认证结果挂到请求对象上。
 */
const { createLogger } = require('../utils/logger');
const { fail } = require('../utils/response');
const { createAdminAuthService } = require('../services/admin-auth-service');

const logger = createLogger('AdminAuthMiddleware');

/**
 * 从 Authorization 请求头中提取 Bearer token。
 * @param {string | undefined} authorizationHeader - 原始 Authorization 请求头。
 * @returns {string | null} 提取出的 token；格式不合法时返回 null。
 */
function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

/**
 * 创建管理员鉴权中间件。
 * 核心分支语义：缺失或非法请求头直接返回 401；认证失败同样返回 401；认证成功则把结果挂到 req.adminAuth 后继续后续路由。
 * @param {{ authService?: { verifyToken: Function } }} [options] - 中间件依赖。
 * @returns {import('express').RequestHandler} 管理员鉴权中间件。
 */
function createAdminAuthMiddleware(options = {}) {
  const authService = options.authService || createAdminAuthService();

  /**
   * 执行管理员鉴权。
   * @param {import('express').Request & { adminAuth?: unknown }} req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @param {import('express').NextFunction} next - 认证通过后继续执行后续路由。
   * @returns {void}
   */
  return function adminAuthMiddleware(req, res, next) {
    const authorizationHeader = req.headers.authorization;
    const token = extractBearerToken(authorizationHeader);

    if (!token) {
      logger.warn(`管理员接口缺少有效 Authorization 请求头 path=${req.originalUrl}`);
      res.status(401).json(fail(401, '未授权访问'));
      return;
    }

    const authResult = authService.verifyToken(token);

    if (!authResult) {
      logger.warn(`管理员接口 token 无效 path=${req.originalUrl}`);
      res.status(401).json(fail(401, '未授权访问'));
      return;
    }

    req.adminAuth = authResult;
    logger.info(`管理员接口鉴权通过 path=${req.originalUrl} adminId=${authResult.adminId}`);
    next();
  };
}

module.exports = {
  createAdminAuthMiddleware,
  extractBearerToken
};
