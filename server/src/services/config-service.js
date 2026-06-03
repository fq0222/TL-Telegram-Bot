/**
 * 概述：封装系统配置的最小业务接口，负责参数校验、日志记录，并委托配置仓储完成持久化。
 */
const { createLogger } = require('../utils/logger');

const logger = createLogger('ConfigService');

/**
 * 创建系统配置服务。
 * @param {{ repository: { saveConfig?: Function, saveConfigs: Function, getConfig: Function } }} options - 服务依赖，至少需要配置仓储。
 * @returns {{ saveConfig: Function, saveConfigs: Function, getConfig: Function }} 配置服务接口。
 */
function createConfigService({ repository }) {
  if (!repository) {
    throw new Error('ConfigService requires a repository');
  }

  if (typeof repository.saveConfigs !== 'function' || typeof repository.getConfig !== 'function') {
    throw new Error('ConfigService repository must expose saveConfigs() and getConfig()');
  }

  /**
   * 规范化单个配置项。
   * 核心分支：配置键为空或配置值不是字符串时直接抛错，保证传入仓储前参数已收敛为可落库格式。
   * @param {{ key: string, value: string }} config - 待校验配置项。
   * @returns {{ key: string, value: string }} 已规范化配置项。
   */
  function normalizeConfigEntry(config) {
    if (!config || typeof config.key !== 'string' || config.key.trim() === '') {
      logger.error('保存系统配置失败：缺少有效的配置键');
      throw new Error('Config key is required');
    }

    if (typeof config.value !== 'string') {
      logger.error(`保存系统配置失败：配置值不是字符串，key=${config.key}`);
      throw new Error('Config value must be a string');
    }

    return {
      key: config.key.trim(),
      value: config.value
    };
  }

  /**
   * 批量保存配置项。
   * 核心分支：空数组直接拒绝，避免调用仓储时出现无意义批量写入。
   * @param {Array<{ key: string, value: string }>} entries - 待保存配置项列表。
   * @returns {Promise<Array<{ key: string, value: string, updatedAt?: string }>>} 已保存配置项列表。
   */
  async function saveConfigs(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      logger.error('批量保存系统配置失败：配置列表为空或格式非法');
      throw new Error('Config entries must be a non-empty array');
    }

    const normalizedEntries = entries.map(normalizeConfigEntry);
    logger.info(`开始批量保存系统配置，条数：${normalizedEntries.length}`);
    return repository.saveConfigs(normalizedEntries);
  }

  /**
   * 保存配置项。
   * 核心分支：单条保存作为批量保存的薄包装，确保参数校验与 trim 逻辑只有一处来源。
   * @param {{ key: string, value: string }} config - 待保存配置。
   * @returns {Promise<{ key: string, value: string, updatedAt?: string }>} 已保存配置。
   */
  async function saveConfig(config) {
    const savedConfigs = await saveConfigs([config]);
    return savedConfigs[0];
  }

  /**
   * 读取配置项。
   * 核心分支：配置键为空时直接报错；未命中时保持 null 返回，由调用方决定缺省值策略。
   * @param {string} key - 配置键。
   * @returns {Promise<{ key: string, value: string, updatedAt?: string } | null>} 配置项或空值。
   */
  async function getConfig(key) {
    if (typeof key !== 'string' || key.trim() === '') {
      logger.error('读取系统配置失败：缺少有效的配置键');
      throw new Error('Config key is required');
    }

    logger.info(`开始读取系统配置：${key}`);
    return repository.getConfig(key.trim());
  }

  return {
    saveConfig,
    saveConfigs,
    getConfig
  };
}

module.exports = {
  createConfigService
};
