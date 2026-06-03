/**
 * 概述：集中读取服务端运行期环境变量，统一处理默认值与基础类型转换，避免启动入口散落读取 `process.env`。
 */

/**
 * 把端口值规范化为正整数。
 * @param {string | number | undefined} value - 原始端口值，可能来自环境变量或测试注入。
 * @param {number} fallbackPort - 当原始值缺失或非法时使用的默认端口。
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
 * 读取服务端运行配置。
 * 核心分支语义：缺失证书路径时保留为空字符串，由上层 HTTPS 状态服务统一决定是否进入降级监听分支。
 * @param {{ env?: NodeJS.ProcessEnv }} [options] - 环境读取依赖，测试时可注入自定义 env。
 * @returns {{ host: string, port: number, tlsFullchainPath: string, tlsPrivkeyPath: string, nodeEnv: string }} 规范化后的启动配置。
 */
function loadServerEnv(options = {}) {
  const env = options.env || process.env;

  return {
    host: typeof env.APP_HOST === 'string' && env.APP_HOST.trim() ? env.APP_HOST.trim() : '0.0.0.0',
    port: normalizePort(env.APP_PORT, 443),
    tlsFullchainPath:
      typeof env.TLS_FULLCHAIN_PATH === 'string' ? env.TLS_FULLCHAIN_PATH.trim() : '',
    tlsPrivkeyPath: typeof env.TLS_PRIVKEY_PATH === 'string' ? env.TLS_PRIVKEY_PATH.trim() : '',
    nodeEnv: typeof env.NODE_ENV === 'string' && env.NODE_ENV.trim() ? env.NODE_ENV.trim() : 'development'
  };
}

module.exports = {
  loadServerEnv,
  normalizePort
};
