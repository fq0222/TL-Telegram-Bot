/**
 * 概述：提供服务端启动入口，负责读取环境配置、判断 TLS 就绪状态，并在 HTTPS 与降级 HTTP 监听之间切换。
 */
const http = require('http');
const https = require('https');
const { createApp } = require('./app');
const { loadServerEnv } = require('./config/env');
const { createHttpsStateService } = require('./services/https-state-service');
const { createLogger } = require('./utils/logger');

const logger = createLogger('Server');

/**
 * 启动服务。
 * 核心分支语义：证书就绪时优先启动 HTTPS；证书缺失时打印告警并降级为 HTTP 监听，保证管理员接口仍可继续初始化与排障。
 * @param {{ app?: unknown, env?: NodeJS.ProcessEnv, httpModule?: { createServer: Function }, httpsModule?: { createServer: Function }, httpsStateService?: { resolveTlsState: Function } }} [options] - 可选启动参数；支持注入应用、环境与网络依赖。
 * @returns {import('http').Server | import('https').Server} 已启动的服务实例。
 */
function startServer(options = {}) {
  const app = options.app || createApp();
  const runtimeEnv = loadServerEnv({ env: options.env });
  const httpModule = options.httpModule || http;
  const httpsModule = options.httpsModule || https;
  const httpsStateService = options.httpsStateService || createHttpsStateService();
  const tlsState = httpsStateService.resolveTlsState({
    tlsFullchainPath: runtimeEnv.tlsFullchainPath,
    tlsPrivkeyPath: runtimeEnv.tlsPrivkeyPath
  });
  const server = tlsState.ready
    ? httpsModule.createServer(
        {
          cert: tlsState.cert,
          key: tlsState.key
        },
        app
      )
    : httpModule.createServer(app);

  logger.info(`准备启动服务，监听地址 ${runtimeEnv.host}:${runtimeEnv.port}`);

  return server.listen(runtimeEnv.port, runtimeEnv.host, () => {
    if (tlsState.ready) {
      logger.info(`HTTPS 服务已启动，监听地址 ${runtimeEnv.host}:${runtimeEnv.port}`);
      return;
    }

    logger.warn(`HTTPS 证书未配置完成，已降级为 HTTP 监听 ${runtimeEnv.host}:${runtimeEnv.port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer
};
