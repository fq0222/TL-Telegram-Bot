/**
 * 概述：提供管理员认证最小服务，当前以可注入的开发期认证配置支撑登录与鉴权流程，后续可替换为真实会话实现。
 */
const { createLogger } = require('../utils/logger');

const logger = createLogger('AdminAuthService');
const DEFAULT_DEV_AUTH = {
  token: 'dev-admin-token',
  adminId: 'dev-admin',
  sessionId: 'dev-session',
  tokenType: 'Bearer'
};

/**
 * 规范化开发期认证配置。
 * @param {{ token?: string, adminId?: string, sessionId?: string, tokenType?: string } | undefined} devAuth - 外部注入的开发认证配置。
 * @returns {{ token: string, adminId: string, sessionId: string, tokenType: string }} 标准化后的开发认证配置。
 */
function normalizeDevAuth(devAuth) {
  return {
    token: devAuth && devAuth.token ? devAuth.token : DEFAULT_DEV_AUTH.token,
    adminId: devAuth && devAuth.adminId ? devAuth.adminId : DEFAULT_DEV_AUTH.adminId,
    sessionId: devAuth && devAuth.sessionId ? devAuth.sessionId : DEFAULT_DEV_AUTH.sessionId,
    tokenType: devAuth && devAuth.tokenType ? devAuth.tokenType : DEFAULT_DEV_AUTH.tokenType
  };
}

/**
 * 创建管理员认证服务。
 * 核心分支语义：登录返回最小 token 信息；鉴权成功返回认证结果对象，失败返回 null，便于中间件专注处理 HTTP 401 分支。
 * @param {{ devAuth?: { token?: string, adminId?: string, sessionId?: string, tokenType?: string } }} [options] - 服务配置。
 * @returns {{ login: Function, verifyToken: Function }} 管理员认证服务实例。
 */
function createAdminAuthService(options = {}) {
  const devAuth = normalizeDevAuth(options.devAuth);

  /**
   * 处理管理员登录。
   * @param {{ username?: string, password?: string }} credentials - 登录凭据；当前仅用于日志与接口占位，暂不做真实校验。
   * @returns {{ token: string, tokenType: string }} 登录结果。
   */
  function login(credentials = {}) {
    const username = credentials.username || 'unknown';

    logger.info(`管理员登录请求已接收 username=${username}`);
    return {
      token: devAuth.token,
      tokenType: devAuth.tokenType
    };
  }

  /**
   * 校验管理员 token。
   * @param {string} token - 从 Authorization 头中提取出的 Bearer token。
   * @returns {{ adminId: string, sessionId: string, tokenType: string } | null} 认证结果；校验失败返回 null。
   */
  function verifyToken(token) {
    if (typeof token !== 'string' || token !== devAuth.token) {
      logger.warn('管理员 token 校验失败');
      return null;
    }

    logger.info('管理员 token 校验通过');
    return {
      adminId: devAuth.adminId,
      sessionId: devAuth.sessionId,
      tokenType: devAuth.tokenType
    };
  }

  return {
    login,
    verifyToken
  };
}

module.exports = {
  DEFAULT_DEV_AUTH,
  createAdminAuthService,
  normalizeDevAuth
};
