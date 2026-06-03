/**
 * 概述：负责处理管理员认证相关 HTTP 请求，
 * 在登录时串联严格冷却控制与认证服务，确保后台登录入口具备最小防爆破能力。
 */
const { createLogger } = require('../utils/logger');
const { fail, ok } = require('../utils/response');
const { createAdminAuthService } = require('../services/admin-auth-service');
const { createAdminLoginAttemptService } = require('../services/admin-login-attempt-service');

const logger = createLogger('AdminAuthController');

/**
 * 提取当前请求的客户端标识。
 * 核心分支语义：优先使用 x-forwarded-for 的第一个地址；否则回退到 req.ip 或 remoteAddress。
 * @param {import('express').Request} req - Express 请求对象。
 * @returns {string} 规整后的客户端标识。
 */
function resolveClientKey(req) {
  const forwardedForHeader =
    req && req.headers && typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for']
      : '';
  const forwardedClient = forwardedForHeader.split(',')[0].trim();

  if (forwardedClient) {
    return forwardedClient;
  }

  if (req && typeof req.ip === 'string' && req.ip.trim() !== '') {
    return req.ip.trim();
  }

  if (
    req &&
    req.socket &&
    typeof req.socket.remoteAddress === 'string' &&
    req.socket.remoteAddress.trim() !== ''
  ) {
    return req.socket.remoteAddress.trim();
  }

  return 'unknown-client';
}

/**
 * 创建管理员认证控制器。
 * @param {{
 *   authService?: { login: Function, getCredentialProfile?: Function, updateCredentials?: Function },
 *   loginAttemptService?: { assertAttemptAllowed?: Function, registerAttempt?: Function }
 * }} [options] - 控制器依赖。
 * @returns {{ login: Function, getCredentials: Function, updateCredentials: Function }} 管理员认证控制器。
 */
function createAdminAuthController(options = {}) {
  const authService = options.authService || createAdminAuthService();
  const loginAttemptService = options.loginAttemptService || createAdminLoginAttemptService();

  /**
   * 处理认证业务中的可公开错误。
   * @param {unknown} error - 捕获到的异常对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @param {import('express').NextFunction} next - Express 下一个中间件。
   * @returns {void}
   */
  function handleKnownAuthError(error, res, next) {
    if (error && typeof error === 'object' && error.expose === true && Number.isInteger(error.statusCode)) {
      res
        .status(error.statusCode)
        .json(fail(error.statusCode, error.message || '请求处理失败', error.details || null));
      return;
    }

    next(error);
  }

  /**
   * 处理管理员登录请求。
   * 核心分支语义：在认证前先校验冷却窗口；一旦允许尝试就立即占用本次配额，确保成功或失败都会进入 30 分钟冷却。
   * @param {import('express').Request} req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @param {import('express').NextFunction} next - Express 下一个中间件。
   * @returns {Promise<void>}
   */
  async function login(req, res, next) {
    try {
      const credentials = req.body || {};
      const clientKey = resolveClientKey(req);

      if (typeof loginAttemptService.assertAttemptAllowed === 'function') {
        loginAttemptService.assertAttemptAllowed(clientKey);
      }

      if (typeof loginAttemptService.registerAttempt === 'function') {
        loginAttemptService.registerAttempt(clientKey);
      }

      const result = await authService.login(credentials);

      logger.info(`管理员登录响应已生成 username=${credentials.username || 'unknown'} client=${clientKey}`);
      res.json(ok(result));
    } catch (error) {
      handleKnownAuthError(error, res, next);
    }
  }

  /**
   * 返回当前管理员凭据概要。
   * @param {import('express').Request} _req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @param {import('express').NextFunction} next - Express 下一个中间件。
   * @returns {Promise<void>}
   */
  async function getCredentials(_req, res, next) {
    try {
      const result = await authService.getCredentialProfile();

      logger.info(`管理员凭据概要已返回 username=${result.username}`);
      res.json(ok(result));
    } catch (error) {
      handleKnownAuthError(error, res, next);
    }
  }

  /**
   * 修改当前管理员登录凭据。
   * @param {import('express').Request} req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @param {import('express').NextFunction} next - Express 下一个中间件。
   * @returns {Promise<void>}
   */
  async function updateCredentials(req, res, next) {
    try {
      const payload = req.body || {};
      const result = await authService.updateCredentials(payload);

      logger.info(`管理员凭据更新响应已生成 username=${result.username}`);
      res.json(ok(result));
    } catch (error) {
      handleKnownAuthError(error, res, next);
    }
  }

  return {
    login,
    getCredentials,
    updateCredentials
  };
}

module.exports = {
  createAdminAuthController,
  resolveClientKey
};
