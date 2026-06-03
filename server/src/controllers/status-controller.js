/**
 * 概述：提供管理员域状态控制器骨架，为后续后台概览、机器人状态与证书状态聚合预留入口。
 */
const { createLogger } = require('../utils/logger');
const { ok } = require('../utils/response');

const logger = createLogger('StatusController');

/**
 * 拼接 Webhook URL。
 * @param {string} webhookBaseUrl - Webhook 对外基础地址。
 * @param {string} webhookPath - Webhook 相对路径。
 * @returns {string} 拼接后的完整 Webhook URL；缺失配置时返回空字符串。
 */
function buildWebhookUrl(webhookBaseUrl, webhookPath) {
  if (!webhookBaseUrl || !webhookPath) {
    return '';
  }

  return `${webhookBaseUrl.replace(/\/+$/, '')}/${webhookPath.replace(/^\/+/, '')}`;
}

/**
 * 创建状态控制器。
 * @param {{
 *   configService?: { getConfigs: Function },
 *   telegramApiService?: { setWebhook: Function }
 * }} [options] - 控制器依赖。
 * @returns {{ getStatus: Function, getOverview: Function, registerWebhook: Function }} 状态控制器骨架。
 */
function createStatusController(options = {}) {
  const configService = options.configService || {
    async getConfigs() {
      return {
        webhook_base_url: '',
        webhook_path: '',
        selected_certificate_domain: '',
        tls_fullchain_path: '',
        tls_privkey_path: ''
      };
    }
  };
  const telegramApiService = options.telegramApiService || {
    async setWebhook() {
      return {
        ok: false
      };
    }
  };

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

  /**
   * 返回管理员概览状态。
   * @param {import('express').Request} _req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {Promise<void>}
   */
  async function getOverview(_req, res) {
    const config = await configService.getConfigs([
      'webhook_base_url',
      'webhook_path',
      'selected_certificate_domain',
      'tls_fullchain_path',
      'tls_privkey_path'
    ]);
    const webhookUrl = buildWebhookUrl(config.webhook_base_url, config.webhook_path);
    const certificateReady = Boolean(config.tls_fullchain_path && config.tls_privkey_path);

    logger.info('返回管理员状态概览');
    res.json(
      ok({
        webhook_url: webhookUrl,
        selected_certificate_domain: config.selected_certificate_domain || '',
        tls_fullchain_path: config.tls_fullchain_path || '',
        tls_privkey_path: config.tls_privkey_path || '',
        certificate_ready: certificateReady
      })
    );
  }

  /**
   * 注册 Telegram Webhook。
   * 核心分支语义：拼接出完整 Webhook URL 后调用 Telegram API 骨架；若缺失基础 URL 或路径，则返回未注册状态。
   * @param {import('express').Request} _req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {Promise<void>}
   */
  async function registerWebhook(_req, res) {
    const config = await configService.getConfigs(['webhook_base_url', 'webhook_path']);
    const webhookUrl = buildWebhookUrl(config.webhook_base_url, config.webhook_path);

    if (!webhookUrl) {
      logger.warn('Webhook 注册被跳过：缺少 webhook_base_url 或 webhook_path');
      res.json(
        ok({
          registered: false,
          webhook_url: ''
        })
      );
      return;
    }

    await telegramApiService.setWebhook({ url: webhookUrl });
    logger.info(`Webhook 注册流程完成，url=${webhookUrl}`);
    res.json(
      ok({
        registered: true,
        webhook_url: webhookUrl
      })
    );
  }

  return {
    getStatus,
    getOverview,
    registerWebhook
  };
}

module.exports = {
  buildWebhookUrl,
  createStatusController
};
