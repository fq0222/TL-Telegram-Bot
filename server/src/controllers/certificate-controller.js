/**
 * 概述：提供证书管理控制器骨架，为后续证书列表与复制流程预留统一控制器入口。
 */
const { createLogger } = require('../utils/logger');
const { ok } = require('../utils/response');

const logger = createLogger('CertificateController');

/**
 * 创建证书控制器。
 * @returns {{ getCertificateStatus: Function }} 证书控制器骨架。
 */
function createCertificateController() {
  /**
   * 返回证书模块最小状态。
   * @param {import('express').Request} _req - Express 请求对象，当前未使用。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {void}
   */
  function getCertificateStatus(_req, res) {
    logger.info('返回证书控制器骨架状态');
    res.json(
      ok({
        ready: false
      })
    );
  }

  return {
    getCertificateStatus
  };
}

module.exports = {
  createCertificateController
};
