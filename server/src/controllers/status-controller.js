/**
 * 概述：提供管理员域状态控制器骨架，为后续后台概览、机器人状态与证书状态聚合预留入口。
 */
const { createLogger } = require('../utils/logger');
const { ok } = require('../utils/response');

const logger = createLogger('StatusController');

/**
 * 创建状态控制器。
 * @returns {{ getStatus: Function }} 状态控制器骨架。
 */
function createStatusController() {
  /**
   * 返回管理员侧最小状态信息。
   * @param {import('express').Request} _req - Express 请求对象，当前未使用。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {void}
   */
  function getStatus(_req, res) {
    logger.info('返回管理员状态骨架响应');
    res.json(
      ok({
        status: 'ready'
      })
    );
  }

  return {
    getStatus
  };
}

module.exports = {
  createStatusController
};
