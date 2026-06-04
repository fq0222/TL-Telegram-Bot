/**
 * 概述：注册统一优雅关闭流程，确保停止任务、关闭服务与数据库连接按固定顺序完成。
 */

/**
 * 注册优雅关闭处理器。
 * @param {{
 *   logger: { info: Function, error: Function },
 *   stopAllJobs: Function,
 *   databaseManager?: { close?: Function } | null,
 *   getServers?: Function,
 *   processObject?: NodeJS.Process,
 *   setTimeoutImpl?: Function,
 *   clearTimeoutImpl?: Function
 * }} options - 关闭流程依赖。
 * @returns {(signal: string) => Promise<void>} 可复用的关闭函数。
 */
function registerShutdown(options) {
  const {
    logger,
    stopAllJobs,
    databaseManager = null,
    getServers = () => ({}),
    processObject = process,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout
  } = options;
  let shuttingDown = false;

  async function gracefulShutdown(signal) {
    if (shuttingDown) {
      logger.info(`关闭流程已在进行中，忽略重复信号 ${signal}`);
      return;
    }

    shuttingDown = true;
    logger.info(`收到${signal}信号，正在优雅关闭服务器...`);
    stopAllJobs();

    const forceExitTimeout = setTimeoutImpl(() => {
      logger.error('关闭超时，强制退出');
      processObject.exit(1);
    }, 10000);

    try {
      const { appServer, userServer, adminServer } = getServers();
      const servers = [appServer, userServer, adminServer].filter(Boolean);

      for (const server of servers) {
        await new Promise((resolve) => {
          server.close(() => {
            logger.info('服务器实例已关闭');
            resolve();
          });
        });
      }

      if (databaseManager && typeof databaseManager.close === 'function') {
        logger.info('正在关闭数据库连接...');
        await databaseManager.close();
        logger.info('数据库连接已关闭');
      }

      clearTimeoutImpl(forceExitTimeout);
      logger.info('服务器已安全关闭');
      processObject.exit(0);
    } catch (error) {
      logger.error(`关闭过程中发生错误: ${error.message}`);
      clearTimeoutImpl(forceExitTimeout);
      processObject.exit(1);
    }
  }

  processObject.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });
  processObject.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
  processObject.on('uncaughtException', (error) => {
    logger.error(`未捕获的异常: ${error.message}`);
    logger.error(error.stack || '');
    void gracefulShutdown('uncaughtException');
  });
  processObject.on('unhandledRejection', (reason) => {
    logger.error(`未处理的Promise拒绝: ${reason}`);
    void gracefulShutdown('unhandledRejection');
  });

  return gracefulShutdown;
}

module.exports = registerShutdown;
