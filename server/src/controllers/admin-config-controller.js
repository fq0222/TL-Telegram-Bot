/**
 * 概述：负责处理管理员配置相关 HTTP 请求，当前提供最小只读配置返回骨架，后续可接入真实配置服务。
 */
const { createLogger } = require('../utils/logger');
const { ok } = require('../utils/response');

const logger = createLogger('AdminConfigController');

/**
 * 创建管理员配置控制器。
 * @returns {{ getConfig: Function }} 管理员配置控制器。
 */
function createAdminConfigController() {
  /**
   * 返回管理员配置。
   * 核心分支语义：当前阶段统一返回空配置对象，占住接口结构；后续可以在不改路由契约的前提下扩展字段。
   * @param {import('express').Request} _req - Express 请求对象，当前阶段未直接使用，保留签名以兼容后续扩展。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {void}
   */
  function getConfig(_req, res) {
    logger.info('返回管理员配置骨架响应');
    res.json(
      ok({
        config: {}
      })
    );
  }

  return {
    getConfig
  };
}

module.exports = {
  createAdminConfigController
};
