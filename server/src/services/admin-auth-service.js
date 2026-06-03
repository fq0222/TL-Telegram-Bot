/**
 * 概述：提供管理员认证最小服务，当前以可注入的开发期认证配置支撑登录与鉴权流程，后续可替换为真实会话实现。
 */
const { createLogger } = require('../utils/logger');
const crypto = require('node:crypto');

const logger = createLogger('AdminAuthService');
const DEFAULT_DEV_AUTH = {
  username: 'admin',
  password: 'dev-password',
  token: 'dev-admin-token',
  adminId: 'dev-admin',
  sessionId: 'dev-session',
  tokenType: 'Bearer'
};
const ADMIN_AUTH_USERNAME_KEY = 'admin_auth_username';
const ADMIN_AUTH_PASSWORD_HASH_KEY = 'admin_auth_password_hash';

/**
 * 规范化管理员会话有效期配置。
 * @param {number | string | undefined} value - 原始秒数配置。
 * @returns {number} 有效期秒数。
 */
function normalizeTokenTtlSeconds(value) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return 3600;
  }

  return parsedValue;
}

/**
 * 规范化开发期认证配置。
 * @param {{ username?: string, password?: string, token?: string, adminId?: string, sessionId?: string, tokenType?: string } | undefined} devAuth - 外部注入的开发认证配置。
 * @returns {{ username: string, password: string, token: string, adminId: string, sessionId: string, tokenType: string }} 标准化后的开发认证配置。
 */
function normalizeDevAuth(devAuth) {
  return {
    username:
      devAuth && devAuth.username
        ? devAuth.username
        : typeof process.env.ADMIN_USERNAME === 'string' && process.env.ADMIN_USERNAME.trim() !== ''
          ? process.env.ADMIN_USERNAME.trim()
          : DEFAULT_DEV_AUTH.username,
    password:
      devAuth && devAuth.password
        ? devAuth.password
        : typeof process.env.ADMIN_PASSWORD === 'string' && process.env.ADMIN_PASSWORD !== ''
          ? process.env.ADMIN_PASSWORD
          : DEFAULT_DEV_AUTH.password,
    token: devAuth && devAuth.token ? devAuth.token : DEFAULT_DEV_AUTH.token,
    adminId: devAuth && devAuth.adminId ? devAuth.adminId : DEFAULT_DEV_AUTH.adminId,
    sessionId: devAuth && devAuth.sessionId ? devAuth.sessionId : DEFAULT_DEV_AUTH.sessionId,
    tokenType: devAuth && devAuth.tokenType ? devAuth.tokenType : DEFAULT_DEV_AUTH.tokenType
  };
}

/**
 * 生成可存储的密码哈希。
 * @param {string} password - 明文密码。
 * @returns {string} 带随机盐的 scrypt 哈希。
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');

  return `scrypt$${salt}$${hash}`;
}

/**
 * 校验明文密码是否匹配存储哈希。
 * @param {string} password - 明文密码。
 * @param {string} storedHash - 持久化存储的密码哈希。
 * @returns {boolean} 是否匹配。
 */
function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string' || storedHash.trim() === '') {
    return false;
  }

  const parts = storedHash.split('$');

  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, expectedHash] = parts;
  const actualHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(actualHash, 'hex');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * 创建管理员认证服务。
 * 核心分支语义：登录返回最小 token 信息；鉴权成功返回认证结果对象，失败返回 null，便于中间件专注处理 HTTP 401 分支。
 * @param {{ devAuth?: { username?: string, password?: string, token?: string, adminId?: string, sessionId?: string, tokenType?: string }, configService?: { getConfigs: Function, saveConfigs?: Function } }} [options] - 服务配置。
 * @returns {{ login: Function, verifyToken: Function, getCredentialProfile: Function, updateCredentials: Function }} 管理员认证服务实例。
 */
function createAdminAuthService(options = {}) {
  const devAuth = normalizeDevAuth(options.devAuth);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const tokenTtlSeconds = normalizeTokenTtlSeconds(options.tokenTtlSeconds || process.env.ADMIN_TOKEN_TTL_SECONDS);
  const sessionRepository = options.sessionRepository || null;
  const configService = options.configService || {
    async getConfigs() {
      return {};
    },
    async saveConfigs() {
      return [];
    }
  };

  /**
   * 读取当前生效的管理员凭据。
   * 核心分支语义：优先使用 SQLite 中已保存的管理员账号；未初始化时回退到开发默认凭据，避免首次进入系统时被锁死。
   * @returns {Promise<{ username: string, passwordHash: string, persisted: boolean } | { username: string, password: string, persisted: boolean }>} 当前可用凭据。
   */
  async function resolveActiveCredentials() {
    const config = await configService.getConfigs([ADMIN_AUTH_USERNAME_KEY, ADMIN_AUTH_PASSWORD_HASH_KEY]);
    const persistedUsername = typeof config[ADMIN_AUTH_USERNAME_KEY] === 'string' ? config[ADMIN_AUTH_USERNAME_KEY].trim() : '';
    const persistedPasswordHash =
      typeof config[ADMIN_AUTH_PASSWORD_HASH_KEY] === 'string' ? config[ADMIN_AUTH_PASSWORD_HASH_KEY].trim() : '';

    if (persistedUsername && persistedPasswordHash) {
      return {
        username: persistedUsername,
        passwordHash: persistedPasswordHash,
        persisted: true
      };
    }

    return {
      username: devAuth.username,
      password: devAuth.password,
      persisted: false
    };
  }

  /**
   * 统一校验登录凭据。
   * @param {{ username?: string, password?: string }} credentials - 待校验登录凭据。
   * @returns {Promise<boolean>} 是否校验通过。
   */
  async function verifyCredentials(credentials = {}) {
    const activeCredentials = await resolveActiveCredentials();
    const username = typeof credentials.username === 'string' ? credentials.username.trim() : '';
    const password = typeof credentials.password === 'string' ? credentials.password : '';

    if (username === '' || password === '' || username !== activeCredentials.username) {
      return false;
    }

    if (activeCredentials.persisted) {
      return verifyPassword(password, activeCredentials.passwordHash);
    }

    return password === activeCredentials.password;
  }

  /**
   * 处理管理员登录。
   * @param {{ username?: string, password?: string }} credentials - 登录凭据；当前仅用于日志与接口占位，暂不做真实校验。
   * @returns {Promise<{ token: string, tokenType: string }>} 登录结果。
   */
  async function login(credentials = {}) {
    const username = credentials.username || 'unknown';
    const verified = await verifyCredentials(credentials);

    if (!verified) {
      const error = new Error('用户名或密码错误');

      error.statusCode = 401;
      error.expose = true;
      logger.warn(`管理员登录校验失败 username=${username}`);
      throw error;
    }

    logger.info(`管理员登录请求已接收 username=${username}`);

    if (sessionRepository && typeof sessionRepository.saveSession === 'function') {
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(now() + tokenTtlSeconds * 1000).toISOString();

      await sessionRepository.saveSession({
        sessionId,
        adminId: devAuth.adminId,
        status: 'active',
        payloadJson: JSON.stringify({
          tokenType: devAuth.tokenType
        }),
        expiresAt
      });

      return {
        token: sessionId,
        tokenType: devAuth.tokenType,
        expiresAt
      };
    }

    return {
      token: devAuth.token,
      tokenType: devAuth.tokenType
    };
  }

  /**
   * 返回当前管理员登录名概要，用于前端凭据修改表单回显。
   * @returns {Promise<{ username: string }>} 当前管理员用户名。
   */
  async function getCredentialProfile() {
    const activeCredentials = await resolveActiveCredentials();

    return {
      username: activeCredentials.username
    };
  }

  /**
   * 修改管理员用户名和密码。
   * 核心分支语义：必须先校验当前密码；校验通过后同时更新用户名与密码哈希，确保凭据切换原子生效。
   * @param {{ username?: string, currentPassword?: string, newPassword?: string }} payload - 凭据修改载荷。
   * @returns {Promise<{ username: string }>} 更新后的用户名概要。
   */
  async function updateCredentials(payload = {}) {
    const nextUsername = typeof payload.username === 'string' ? payload.username.trim() : '';
    const currentPassword = typeof payload.currentPassword === 'string' ? payload.currentPassword : '';
    const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';

    if (!nextUsername || !currentPassword || !newPassword) {
      const error = new Error('用户名、当前密码和新密码均不能为空');

      error.statusCode = 400;
      error.expose = true;
      logger.warn('管理员凭据更新失败：缺少必要字段');
      throw error;
    }

    const verified = await verifyCredentials({
      username: (await resolveActiveCredentials()).username,
      password: currentPassword
    });

    if (!verified) {
      const error = new Error('当前密码错误');

      error.statusCode = 401;
      error.expose = true;
      logger.warn(`管理员凭据更新失败：当前密码校验未通过 username=${nextUsername}`);
      throw error;
    }

    if (typeof configService.saveConfigs !== 'function') {
      throw new Error('Config service saveConfigs is required for updating admin credentials');
    }

    await configService.saveConfigs([
      {
        key: ADMIN_AUTH_USERNAME_KEY,
        value: nextUsername
      },
      {
        key: ADMIN_AUTH_PASSWORD_HASH_KEY,
        value: hashPassword(newPassword)
      }
    ]);

    logger.info(`管理员凭据更新成功 username=${nextUsername}`);
    return {
      username: nextUsername
    };
  }

  /**
   * 校验管理员 token。
   * @param {string} token - 从 Authorization 头中提取出的 Bearer token。
   * @returns {{ adminId: string, sessionId: string, tokenType: string } | null} 认证结果；校验失败返回 null。
   */
  async function verifyToken(token) {
    if (sessionRepository && typeof sessionRepository.getSession === 'function') {
      const session = await sessionRepository.getSession(token);

      if (!session || session.status !== 'active') {
        logger.warn('管理员 token 校验失败');
        return null;
      }

      if (session.expiresAt) {
        const expiresAtTime = Date.parse(session.expiresAt);

        if (!Number.isNaN(expiresAtTime) && now() >= expiresAtTime) {
          logger.warn('管理员 token 已过期');
          return null;
        }
      }

      let tokenType = devAuth.tokenType;

      if (typeof session.payloadJson === 'string' && session.payloadJson !== '') {
        try {
          const payload = JSON.parse(session.payloadJson);

          if (payload && typeof payload.tokenType === 'string' && payload.tokenType !== '') {
            tokenType = payload.tokenType;
          }
        } catch (_error) {
          logger.warn(`管理员会话载荷解析失败 sessionId=${session.sessionId}`);
        }
      }

      logger.info('管理员 token 校验通过');
      return {
        adminId: session.adminId,
        sessionId: session.sessionId,
        tokenType
      };
    }

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
    verifyToken,
    getCredentialProfile,
    updateCredentials
  };
}

module.exports = {
  ADMIN_AUTH_PASSWORD_HASH_KEY,
  ADMIN_AUTH_USERNAME_KEY,
  DEFAULT_DEV_AUTH,
  createAdminAuthService,
  hashPassword,
  normalizeTokenTtlSeconds,
  normalizeDevAuth
};
