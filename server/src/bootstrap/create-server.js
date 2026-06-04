/**
 * 概述：根据 TLS 状态或注入的 serverFactory 创建并启动 HTTP/HTTPS 服务实例。
 */
const http = require('http');
const https = require('https');
const { createHttpsStateService } = require('../services/https-state-service');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CreateServer');

/**
 * 创建并启动监听中的服务实例。
 * @param {{
 *   app: unknown,
 *   runtimeEnv: { host: string, tlsFullchainPath: string, tlsPrivkeyPath: string },
 *   listenPort: number,
 *   httpModule?: { createServer: Function },
 *   httpsModule?: { createServer: Function },
 *   httpsStateService?: { resolveTlsState: Function },
 *   serverFactory?: Function,
 *   onListening?: Function
 * }} options - 服务创建参数。
 * @returns {import('http').Server | import('https').Server} 已启动的服务实例。
 */
function createListeningServer(options) {
  const {
    app,
    runtimeEnv,
    listenPort,
    httpModule = http,
    httpsModule = https,
    httpsStateService = createHttpsStateService(),
    serverFactory,
    onListening = () => {}
  } = options;

  if (typeof serverFactory === 'function') {
    const injectedServer = serverFactory(app);

    logger.info(`准备启动服务，监听地址 ${runtimeEnv.host}:${listenPort}`);
    return injectedServer.listen(listenPort, () => {
      logger.info(`服务已通过注入 serverFactory 启动，监听端口 ${listenPort}`);
      onListening();
    });
  }

  const tlsState = httpsStateService.resolveTlsState({
    tlsFullchainPath: runtimeEnv.tlsFullchainPath,
    tlsPrivkeyPath: runtimeEnv.tlsPrivkeyPath
  });
  const appServer = tlsState.ready
    ? httpsModule.createServer(
        {
          cert: tlsState.cert,
          key: tlsState.key
        },
        app
      )
    : httpModule.createServer(app);

  logger.info(`准备启动服务，监听地址 ${runtimeEnv.host}:${listenPort}`);

  appServer.listen(listenPort, runtimeEnv.host, () => {
    if (tlsState.ready) {
      logger.info(`HTTPS 服务已启动，监听地址 ${runtimeEnv.host}:${listenPort}`);
    } else {
      logger.warn(`HTTPS 证书未配置完成，已降级为 HTTP 监听 ${runtimeEnv.host}:${listenPort}`);
    }

    onListening();
  });

  return appServer;
}

module.exports = {
  createListeningServer
};
