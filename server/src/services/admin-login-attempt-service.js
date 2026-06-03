/**
 * 概述：提供管理员登录严格冷却控制，
 * 负责按客户端标识记录最近一次登录尝试时间，并在冷却期内阻止再次尝试。
 */
const { createLogger } = require('../utils/logger');

const logger = createLogger('AdminLoginAttemptService');

/**
 * 规范化登录冷却秒数。
 * @param {number | string | undefined} value - 原始秒数配置。
 * @returns {number} 规范化后的秒数，默认 1800 秒。
 */
function normalizeCooldownSeconds(value) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return 1800;
  }

  return parsedValue;
}

/**
 * 创建管理员登录冷却服务。
 * @param {{ now?: Function, cooldownSeconds?: number|string }} [options] - 服务依赖与配置。
 * @returns {{ assertAttemptAllowed: Function, registerAttempt: Function }} 登录冷却服务。
 */
function createAdminLoginAttemptService(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const cooldownSeconds = normalizeCooldownSeconds(
    options.cooldownSeconds || process.env.ADMIN_LOGIN_COOLDOWN_SECONDS
  );
  const attemptMap = new Map();

  /**
   * 校验当前客户端是否允许继续登录。
   * @param {string} clientKey - 客户端标识。
   * @returns {void}
   */
  function assertAttemptAllowed(clientKey) {
    const normalizedClientKey = typeof clientKey === 'string' ? clientKey.trim() : '';

    if (!normalizedClientKey) {
      return;
    }

    const nextAllowedAt = attemptMap.get(normalizedClientKey);

    if (!nextAllowedAt || nextAllowedAt <= now()) {
      if (nextAllowedAt) {
        attemptMap.delete(normalizedClientKey);
      }

      return;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((nextAllowedAt - now()) / 1000));
    const error = new Error(`登录限制已触发，请在30分钟后重试`);

    error.statusCode = 429;
    error.expose = true;
    error.details = {
      retryAfterSeconds,
      retryAt: new Date(nextAllowedAt).toISOString()
    };
    logger.warn(`管理员登录冷却命中 client=${normalizedClientKey} retryAfterSeconds=${retryAfterSeconds}`);
    throw error;
  }

  /**
   * 记录本次登录尝试并写入下一次允许时间。
   * @param {string} clientKey - 客户端标识。
   * @returns {{ retryAt: string, cooldownSeconds: number }} 冷却结果。
   */
  function registerAttempt(clientKey) {
    const normalizedClientKey = typeof clientKey === 'string' ? clientKey.trim() : '';

    if (!normalizedClientKey) {
      return {
        retryAt: new Date(now() + cooldownSeconds * 1000).toISOString(),
        cooldownSeconds
      };
    }

    const nextAllowedAt = now() + cooldownSeconds * 1000;

    attemptMap.set(normalizedClientKey, nextAllowedAt);
    logger.info(`记录管理员登录尝试 client=${normalizedClientKey} cooldownSeconds=${cooldownSeconds}`);
    return {
      retryAt: new Date(nextAllowedAt).toISOString(),
      cooldownSeconds
    };
  }

  return {
    assertAttemptAllowed,
    registerAttempt
  };
}

module.exports = {
  createAdminLoginAttemptService,
  normalizeCooldownSeconds
};
