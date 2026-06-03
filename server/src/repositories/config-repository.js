/**
 * 概述：封装 system_configs 表的最小读写能力，供配置服务统一保存和读取系统配置项。
 */
const { createLogger } = require('../utils/logger');

const logger = createLogger('ConfigRepository');

/**
 * 创建系统配置仓储。
 * @param {{ database: { prepare: Function, transaction?: Function } }} options - 仓储依赖。
 * @returns {{
 *   saveConfig: Function,
 *   saveConfigs: Function,
 *   getConfig: Function,
 *   getConfigSync: Function
 * }} 配置仓储接口。
 */
function createConfigRepository({ database }) {
  if (!database || typeof database.prepare !== 'function') {
    throw new Error('ConfigRepository requires a database with prepare()');
  }

  const upsertStatement = database.prepare(`
    INSERT INTO system_configs (config_key, config_value, updated_at)
    VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(config_key) DO UPDATE SET
      config_value = excluded.config_value,
      updated_at = datetime('now', 'localtime')
    RETURNING
      config_key AS key,
      config_value AS value,
      updated_at AS updatedAt
  `);
  const selectStatement = database.prepare(`
    SELECT
      config_key AS key,
      config_value AS value,
      updated_at AS updatedAt
    FROM system_configs
    WHERE config_key = ?
  `);
  const runInTransaction =
    typeof database.transaction === 'function'
      ? database.transaction.bind(database)
      : (handler) => handler;

  const saveConfigsTransaction = runInTransaction((entries) =>
    entries.map((entry) => upsertStatement.run(entry.key, entry.value))
  );

  /**
   * 批量保存系统配置项。
   * @param {Array<{ key: string, value: string }>} entries - 待保存配置项列表。
   * @returns {Promise<Array<{ key: string, value: string, updatedAt: string }>>} 已保存配置项列表。
   */
  async function saveConfigs(entries) {
    logger.info(`批量保存系统配置，条数：${entries.length}`);

    saveConfigsTransaction(entries);
    return entries.map((entry) => getConfigSync(entry.key));
  }

  /**
   * 保存单个系统配置项。
   * @param {{ key: string, value: string }} config - 待保存配置。
   * @returns {Promise<{ key: string, value: string, updatedAt: string }>} 已保存配置项。
   */
  async function saveConfig(config) {
    logger.info(`保存系统配置：${config.key}`);
    const savedConfigs = await saveConfigs([config]);
    return savedConfigs[0];
  }

  /**
   * 同步读取单个系统配置项。
   * 核心分支：未命中配置时返回 null，便于启动阶段继续回退环境变量。
   * @param {string} key - 待查询的配置键。
   * @returns {{ key: string, value: string, updatedAt: string } | null} 配置项或空值。
   */
  function getConfigSync(key) {
    logger.info(`同步读取系统配置：${key}`);
    return selectStatement.get(key) || null;
  }

  /**
   * 读取单个系统配置项。
   * @param {string} key - 待查询的配置键。
   * @returns {Promise<{ key: string, value: string, updatedAt: string } | null>} 配置项或空值。
   */
  async function getConfig(key) {
    logger.info(`读取系统配置：${key}`);
    return getConfigSync(key);
  }

  return {
    saveConfig,
    saveConfigs,
    getConfig,
    getConfigSync
  };
}

module.exports = {
  createConfigRepository
};
