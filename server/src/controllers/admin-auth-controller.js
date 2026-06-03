/**
 * 概述：负责处理管理员认证相关 HTTP 请求，当前仅提供最小登录骨架并调用认证服务签发开发期 token。
 */
const { createLogger } = require('../utils/logger');
const { ok } = require('../utils/response');
const { createAdminAuthService } = require('../services/admin-auth-service');

const logger = createLogger('AdminAuthController');

/**
 * 创建管理员认证控制器。
 * @param {{ authService?: { login: Function } }} [options] - 控制器依赖，允许注入自定义认证服务。
 * @returns {{ login: Function }} 管理员认证控制器。
 */
function createAdminAuthController(options = {}) {
  const authService = options.authService || createAdminAuthService();

  /**
   * 处理管理员登录请求。
   * 核心分支语义：当前阶段不拒绝开发期凭据，统一由服务层签发最小 token，便于后续替换成真实密码或会话逻辑。
   * @param {import('express').Request} req - Express 请求对象，`body` 中可携带登录凭据。
   * @param {import('express').Response} res - Express 响应对象，用于返回统一成功结构。
   * @returns {void}
   */
  function login(req, res) {
    const credentials = req.body || {};
    const result = authService.login(credentials);

    logger.info(`管理员登录响应已生成 username=${credentials.username || 'unknown'}`);
    res.json(ok(result));
  }

  return {
    login
  };
}

module.exports = {
  createAdminAuthController
};
