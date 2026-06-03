/**
 * 概述：提供服务端启动入口，负责读取环境配置、判断 TLS 就绪状态，并在 HTTPS 与降级 HTTP 监听之间切换。
 */
const http = require('http');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createApp } = require('./app');
const { loadServerEnv } = require('./config/env');
const { createHttpsStateService } = require('./services/https-state-service');
const { createLogger } = require('./utils/logger');

const logger = createLogger('Server');

/**
 * 启动服务。
 * 核心分支语义：优先支持显式注入的 serverFactory/port 以便测试；否则按 TLS 状态决定启动 HTTPS 或降级 HTTP。
 * @param {{
 *   app?: unknown,
 *   env?: NodeJS.ProcessEnv,
 *   port?: number,
 *   httpModule?: { createServer: Function },
 *   httpsModule?: { createServer: Function },
 *   httpsStateService?: { resolveTlsState: Function },
 *   serverFactory?: Function
 * }} [options] - 可选启动参数。
 * @returns {import('http').Server | import('https').Server} 已启动的服务实例。
 */
function startServer(options = {}) {
  const app = options.app || createApp();
  const runtimeEnv = loadServerEnv({ env: options.env });
  const listenPort = Number.isInteger(options.port) && options.port > 0 ? options.port : runtimeEnv.port;
  const httpModule = options.httpModule || http;
  const httpsModule = options.httpsModule || https;
  const httpsStateService = options.httpsStateService || createHttpsStateService();

  if (typeof options.serverFactory === 'function') {
    const injectedServer = options.serverFactory(app);

    logger.info(`准备启动服务，监听地址 ${runtimeEnv.host}:${listenPort}`);
    return injectedServer.listen(listenPort, () => {
      logger.info(`服务已通过注入 serverFactory 启动，监听端口 ${listenPort}`);
    });
  }

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

  logger.info(`准备启动服务，监听地址 ${runtimeEnv.host}:${listenPort}`);

  return server.listen(listenPort, runtimeEnv.host, () => {
    if (tlsState.ready) {
      logger.info(`HTTPS 服务已启动，监听地址 ${runtimeEnv.host}:${listenPort}`);
      return;
    }

    logger.warn(`HTTPS 证书未配置完成，已降级为 HTTP 监听 ${runtimeEnv.host}:${listenPort}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer
};
