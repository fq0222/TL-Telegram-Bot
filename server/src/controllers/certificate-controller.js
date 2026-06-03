/**
 * 概述：提供证书管理控制器骨架，为后续证书列表与复制流程预留统一控制器入口。
 */
const { createLogger } = require('../utils/logger');
const { ok } = require('../utils/response');

const logger = createLogger('CertificateController');

/**
 * 创建证书控制器。
 * @param {{
 *   certificateService?: { listDomains: Function, activateDomain: Function },
 *   configService?: { saveConfigs: Function, getConfigs: Function }
 * }} [options] - 控制器依赖。
 * @returns {{ getCertificateStatus: Function, listDomains: Function, selectDomain: Function }} 证书控制器骨架。
 */
function createCertificateController(options = {}) {
  const certificateService = options.certificateService || {
    async listDomains() {
      return [];
    },
    async activateDomain(domain) {
      return {
        domain,
        fullchainPath: '',
        privkeyPath: ''
      };
    }
  };
  const configService = options.configService || {
    async saveConfigs() {
      return [];
    },
    async getConfigs() {
      return {
        selected_certificate_domain: '',
        tls_fullchain_path: '',
        tls_privkey_path: ''
      };
    }
  };

  /**
   * 返回证书模块最小状态。
   * @param {import('express').Request} _req - Express 请求对象，当前未使用。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {void}
   */
  async function getCertificateStatus(_req, res, next) {
    try {
      const config = await configService.getConfigs([
        'selected_certificate_domain',
        'tls_fullchain_path',
        'tls_privkey_path'
      ]);
      const ready = Boolean(config.tls_fullchain_path && config.tls_privkey_path);

      logger.info('返回证书控制器骨架状态');
      res.json(
        ok({
          ready,
          selected_certificate_domain: config.selected_certificate_domain || '',
          tls_fullchain_path: config.tls_fullchain_path || '',
          tls_privkey_path: config.tls_privkey_path || ''
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * 返回可选证书域名列表。
   * @param {import('express').Request} _req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {Promise<void>}
   */
  async function listDomains(_req, res, next) {
    try {
      const domains = await certificateService.listDomains();

      logger.info(`返回可用证书域名列表，数量=${domains.length}`);
      res.json(
        ok({
          domains
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * 选择并激活指定域名证书。
   * 核心分支语义：激活成功后立刻把选中的域名和目标证书路径写入配置存储，供 HTTPS 与状态页复用。
   * @param {import('express').Request & { body?: { domain?: string } }} req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {Promise<void>}
   */
  async function selectDomain(req, res, next) {
    try {
      const domain = req.body && typeof req.body.domain === 'string' ? req.body.domain : '';
      const result = await certificateService.activateDomain(domain);
      const savedConfigEntries = [
        {
          key: 'selected_certificate_domain',
          value: result.domain
        },
        {
          key: 'tls_fullchain_path',
          value: result.fullchainPath
        },
        {
          key: 'tls_privkey_path',
          value: result.privkeyPath
        }
      ];

      await configService.saveConfigs(savedConfigEntries);
      logger.info(`证书域名选择完成，domain=${result.domain}`);
      res.json(
        ok({
          selected_certificate_domain: result.domain,
          tls_fullchain_path: result.fullchainPath,
          tls_privkey_path: result.privkeyPath
        })
      );
    } catch (error) {
      next(error);
    }
  }

  return {
    getCertificateStatus,
    listDomains,
    selectDomain
  };
}

module.exports = {
  createCertificateController
};
