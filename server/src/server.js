/**
 * 概述：提供服务端最小启动入口，负责创建应用、构造显式监听层并启动 HTTP 服务。
 */
const http = require('http');
const { createApp } = require('./app');
const { createLogger } = require('./utils/logger');

const logger = createLogger('Server');

/**
 * 启动 HTTP 服务。
 * @param {{app?: unknown, port?: number|string, serverFactory?: Function}} options - 可选启动参数；可注入 app 或 serverFactory，为后续切换 HTTPS 监听层预留接口。
 * @returns {import('http').Server} 已启动的 HTTP 服务实例。
 */
function startServer(options = {}) {
  const app = options.app || createApp();
  const port = Number(options.port || process.env.APP_PORT || 3000);
  const serverFactory = options.serverFactory || ((expressApp) => http.createServer(expressApp));
  const server = serverFactory(app);

  logger.info(`准备启动服务，监听端口 ${port}`);

  return server.listen(port, () => {
    logger.info(`服务已启动，监听端口 ${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer
};
