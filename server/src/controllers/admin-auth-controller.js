/**
 * 概述：负责处理管理员认证相关 HTTP 请求，当前仅提供最小登录骨架并调用认证服务签发开发期 token。
 */
const { createLogger } = require('../utils/logger');
const { fail, ok } = require('../utils/response');
const { createAdminAuthService } = require('../services/admin-auth-service');

const logger = createLogger('AdminAuthController');

/**
 * 创建管理员认证控制器。
 * @param {{ authService?: { login: Function, getCredentialProfile?: Function, updateCredentials?: Function } }} [options] - 控制器依赖，允许注入自定义认证服务。
 * @returns {{ login: Function, getCredentials: Function, updateCredentials: Function }} 管理员认证控制器。
 */
function createAdminAuthController(options = {}) {
  const authService = options.authService || createAdminAuthService();

  /**
   * 处理认证业务中的可公开错误，避免已知 4xx 业务分支依赖全局错误中间件才能返回统一结构。
   * @param {unknown} error - 捕获到的异常对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @param {import('express').NextFunction} next - Express 下一个中间件。
   * @returns {void}
   */
  function handleKnownAuthError(error, res, next) {
    if (error && typeof error === 'object' && error.expose === true && Number.isInteger(error.statusCode)) {
      res.status(error.statusCode).json(fail(error.statusCode, error.message || '请求处理失败'));
      return;
    }

    next(error);
  }

  /**
   * 处理管理员登录请求。
   * 核心分支语义：当前阶段不拒绝开发期凭据，统一由服务层签发最小 token，便于后续替换成真实密码或会话逻辑。
   * @param {import('express').Request} req - Express 请求对象，`body` 中可携带登录凭据。
   * @param {import('express').Response} res - Express 响应对象，用于返回统一成功结构。
   * @param {import('express').NextFunction} next - Express 下一个中间件。
   * @returns {Promise<void>}
   */
  async function login(req, res, next) {
    try {
      const credentials = req.body || {};
      const result = await authService.login(credentials);

      logger.info(`管理员登录响应已生成 username=${credentials.username || 'unknown'}`);
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
  createAdminAuthController
};
