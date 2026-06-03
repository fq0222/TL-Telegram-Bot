/**
 * 概述：集中读取服务端运行期环境变量，并优先合并数据库中的 TLS 证书路径配置，统一处理默认值与基础类型转换。
 */
const { createLogger } = require('../utils/logger');
const { createDatabase } = require('./database');
const { createConfigRepository } = require('../repositories/config-repository');
const { createConfigService } = require('../services/config-service');

const logger = createLogger('ServerEnv');

/**
 * 把端口值规范化为正整数。
 * @param {string | number | undefined} value - 原始端口值。
 * @param {number} fallbackPort - 默认端口。
 * @returns {number} 规范化后的端口值。
 */
function normalizePort(value, fallbackPort) {
  const parsedPort = Number(value);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    return fallbackPort;
  }

  return parsedPort;
}

/**
 * 解析字符串配置值。
 * @param {unknown} value - 原始配置值。
 * @returns {string} 去除首尾空白后的字符串；无效时返回空串。
 */
function normalizeStringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 创建启动阶段使用的配置服务。
 * @param {{
 *   database?: { close?: Function },
 *   configService?: { getConfigsSync?: Function },
 *   databaseFactory?: Function,
 *   repositoryFactory?: Function,
 *   configServiceFactory?: Function
 * }} [options] - 可注入依赖，便于测试与扩展。
 * @returns {{ configService: { getConfigsSync: Function }, close?: Function }} 配置服务及清理函数。
 */
function createStartupConfigContext(options = {}) {
  if (options.configService) {
    return {
      configService: options.configService,
      close: null
    };
  }

  const databaseFactory = options.databaseFactory || createDatabase;
  const repositoryFactory = options.repositoryFactory || createConfigRepository;
  const configServiceFactory = options.configServiceFactory || createConfigService;
  const database = options.database || databaseFactory();
  const repository = repositoryFactory({ database });
  const configService = configServiceFactory({ repository });

  return {
    configService,
    close: typeof database.close === 'function' ? () => database.close() : null
  };
}

/**
 * 优先从数据库读取 TLS 路径配置。
 * 核心分支：数据库读取失败时记录告警并回退环境变量，避免因配置表异常阻塞服务启动。
 * @param {{
 *   configService?: { getConfigsSync?: Function },
 *   database?: { close?: Function },
 *   databaseFactory?: Function,
 *   repositoryFactory?: Function,
 *   configServiceFactory?: Function
 * }} [options] - 配置读取依赖。
 * @returns {{ tlsFullchainPath: string, tlsPrivkeyPath: string }} TLS 路径快照。
 */
function loadTlsConfigFromDatabase(options = {}) {
  let context = null;

  try {
    context = createStartupConfigContext(options);
    const configSnapshot = context.configService.getConfigsSync([
      'tls_fullchain_path',
      'tls_privkey_path'
    ]);

    logger.info('已读取数据库中的 TLS 路径配置');
    return {
      tlsFullchainPath: normalizeStringValue(configSnapshot.tls_fullchain_path),
      tlsPrivkeyPath: normalizeStringValue(configSnapshot.tls_privkey_path)
    };
  } catch (error) {
    logger.warn(
      `读取数据库 TLS 配置失败，将回退环境变量：${error && error.message ? error.message : 'unknown error'}`
    );
    return {
      tlsFullchainPath: '',
      tlsPrivkeyPath: ''
    };
  } finally {
    if (context && typeof context.close === 'function') {
      context.close();
    }
  }
}

/**
 * 读取服务端运行配置。
 * 核心分支：优先采用数据库中的 TLS 证书路径；数据库为空或读取失败时再回退环境变量。
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   configService?: { getConfigsSync?: Function },
 *   database?: { close?: Function },
 *   databaseFactory?: Function,
 *   repositoryFactory?: Function,
 *   configServiceFactory?: Function
 * }} [options] - 环境读取依赖。
 * @returns {{ host: string, port: number, tlsFullchainPath: string, tlsPrivkeyPath: string, nodeEnv: string }} 规范化后的启动配置。
 */
function loadServerEnv(options = {}) {
  const env = options.env || process.env;
  const databaseTlsConfig = loadTlsConfigFromDatabase(options);
  const envTlsFullchainPath = normalizeStringValue(env.TLS_FULLCHAIN_PATH);
  const envTlsPrivkeyPath = normalizeStringValue(env.TLS_PRIVKEY_PATH);

  return {
    host: normalizeStringValue(env.APP_HOST) || '0.0.0.0',
    port: normalizePort(env.APP_PORT, 443),
    tlsFullchainPath: databaseTlsConfig.tlsFullchainPath || envTlsFullchainPath,
    tlsPrivkeyPath: databaseTlsConfig.tlsPrivkeyPath || envTlsPrivkeyPath,
    nodeEnv: normalizeStringValue(env.NODE_ENV) || 'development'
  };
}

module.exports = {
  createStartupConfigContext,
  loadServerEnv,
  loadTlsConfigFromDatabase,
  normalizePort,
  normalizeStringValue
};
