/**
 * 概述：根据 TLS 状态或注入的 serverFactory 创建并启动 HTTP/HTTPS 服务实例。
 */
const http = require('http');
const https = require('https');
const { createHttpsStateService } = require('../services/https-state-service');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CreateServer');

/**
 * 服务监听对象，封装 HTTP/HTTPS 创建与启动生命周期。
 */
class ListeningServer {
  /**
   * 创建监听服务生命周期对象。
   * 核心分支语义：优先使用注入 serverFactory 便于测试；未注入时根据 TLS 就绪状态选择 HTTPS 或降级 HTTP。
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
   */
  constructor(options) {
    this.app = options.app;
    this.runtimeEnv = options.runtimeEnv;
    this.listenPort = options.listenPort;
    this.httpModule = options.httpModule || http;
    this.httpsModule = options.httpsModule || https;
    this.httpsStateService = options.httpsStateService || createHttpsStateService();
    this.serverFactory = options.serverFactory;
    this.onListening = options.onListening || (() => {});

    this.start = this.start.bind(this);
  }

  /**
   * 创建并启动监听中的服务实例。
   * @returns {import('http').Server | import('https').Server} 已启动的服务实例。
   */
  start() {
    if (typeof this.serverFactory === 'function') {
      const injectedServer = this.serverFactory(this.app);

      logger.info(`准备启动服务，监听地址 ${this.runtimeEnv.host}:${this.listenPort}`);
      return injectedServer.listen(this.listenPort, () => {
        logger.info(`服务已通过注入 serverFactory 启动，监听端口 ${this.listenPort}`);
        this.onListening();
      });
    }

    const tlsState = this.httpsStateService.resolveTlsState({
      tlsFullchainPath: this.runtimeEnv.tlsFullchainPath,
      tlsPrivkeyPath: this.runtimeEnv.tlsPrivkeyPath
    });
    const appServer = tlsState.ready
      ? this.httpsModule.createServer(
          {
            cert: tlsState.cert,
            key: tlsState.key
          },
          this.app
        )
      : this.httpModule.createServer(this.app);

    logger.info(`准备启动服务，监听地址 ${this.runtimeEnv.host}:${this.listenPort}`);

    appServer.listen(this.listenPort, this.runtimeEnv.host, () => {
      if (tlsState.ready) {
        logger.info(`HTTPS 服务已启动，监听地址 ${this.runtimeEnv.host}:${this.listenPort}`);
      } else {
        logger.warn(`HTTPS 证书未配置完成，已降级为 HTTP 监听 ${this.runtimeEnv.host}:${this.listenPort}`);
      }

      this.onListening();
    });

    return appServer;
  }
}

/**
 * 创建监听服务生命周期对象的迁移期兼容包装。
 * @param {ConstructorParameters<typeof ListeningServer>[0]} options - 服务创建参数。
 * @returns {ListeningServer} 监听服务生命周期对象。
 */
function createListeningServer(options) {
  return new ListeningServer(options);
}

module.exports = {
  ListeningServer,
  createListeningServer
};
