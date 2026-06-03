/**
 * 概述：负责处理管理员配置相关 HTTP 请求，当前提供最小只读配置返回骨架，后续可接入真实配置服务。
 */
const { createLogger } = require('../utils/logger');
const { ok } = require('../utils/response');

const logger = createLogger('AdminConfigController');
const CONFIG_KEYS = [
  'telegram_bot_token',
  'webhook_path',
  'webhook_base_url',
  'internal_api_base_url',
  'internal_api_secret',
  'selected_certificate_domain',
  'tls_fullchain_path',
  'tls_privkey_path'
];

/**
 * 创建空配置快照。
 * @param {Record<string, string>} [partialConfig={}] - 已读取到的部分配置。
 * @returns {Record<string, string>} 补齐默认值后的完整配置快照。
 */
function buildConfigSnapshot(partialConfig = {}) {
  return CONFIG_KEYS.reduce((result, key) => {
    result[key] = typeof partialConfig[key] === 'string' ? partialConfig[key] : '';
    return result;
  }, {});
}

/**
 * 创建管理员配置控制器。
 * @param {{ configService?: { getConfigs: Function, saveConfigs: Function } }} [options] - 控制器依赖。
 * @returns {{ getConfig: Function, saveConfig: Function }} 管理员配置控制器。
 */
function createAdminConfigController(options = {}) {
  const configService = options.configService || {
    async getConfigs() {
      return buildConfigSnapshot();
    },
    async saveConfigs() {
      return [];
    }
  };

  /**
   * 返回管理员配置。
   * 核心分支语义：当前阶段统一返回空配置对象，占住接口结构；后续可以在不改路由契约的前提下扩展字段。
   * @param {import('express').Request} _req - Express 请求对象，当前阶段未直接使用，保留签名以兼容后续扩展。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {void}
   */
  async function getConfig(_req, res, next) {
    try {
      const config = buildConfigSnapshot(await configService.getConfigs(CONFIG_KEYS));

      logger.info('返回管理员配置骨架响应');
      res.json(
        ok({
          config
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * 保存管理员配置。
   * 核心分支语义：仅持久化白名单配置键；未提供的字段保持原状，避免前端局部保存时误清空其他配置。
   * @param {import('express').Request & { body?: Record<string, unknown> }} req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {Promise<void>}
   */
  async function saveConfig(req, res, next) {
    try {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const entries = CONFIG_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(payload, key)).map((key) => ({
        key,
        value: typeof payload[key] === 'string' ? payload[key] : String(payload[key] ?? '')
      }));

      if (entries.length > 0) {
        await configService.saveConfigs(entries);
      }

      const config = buildConfigSnapshot({
        ...(await configService.getConfigs(CONFIG_KEYS)),
        ...entries.reduce((result, entry) => {
          result[entry.key] = entry.value;
          return result;
        }, {})
      });

      logger.info(`管理员配置保存完成，字段数=${entries.length}`);
      res.json(
        ok({
          config
        })
      );
    } catch (error) {
      next(error);
    }
  }

  return {
    getConfig,
    saveConfig
  };
}

module.exports = {
  CONFIG_KEYS,
  buildConfigSnapshot,
  createAdminConfigController
};
