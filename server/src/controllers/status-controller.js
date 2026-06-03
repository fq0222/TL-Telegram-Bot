/**
 * 概述：聚合管理员状态、Webhook 注册状态与基础证书配置概览，
 * 让管理端能够看到真实的 Telegram 注册结果，而不是固定的骨架状态。
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
 *   telegramApiService?: { setWebhook?: Function, getWebhookInfo?: Function }
 * }} [options] - 控制器依赖。
 * @returns {{ getStatus: Function, getOverview: Function, registerWebhook: Function }} 状态控制器。
 */
function createStatusController(options = {}) {
  const configService = options.configService || {
    async getConfigs() {
      return {
        webhook_base_url: '',
        webhook_path: '',
        selected_certificate_domain: '',
        tls_fullchain_path: '',
        tls_privkey_path: '',
        telegram_bot_token: ''
      };
    }
  };
  const telegramApiService = options.telegramApiService || {
    async setWebhook() {
      return {
        ok: false
      };
    },
    async getWebhookInfo() {
      return {
        ok: false,
        result: {
          url: ''
        }
      };
    }
  };

  /**
   * 聚合当前管理端所需的 Webhook 与证书状态。
   * 核心分支语义：缺少 token、Webhook 地址或证书路径时返回 pending；
   * 基础配置齐全但 Telegram 端未注册成功或查询失败时返回 degraded；全部对齐时返回 ready。
   * @returns {Promise<{
   *   status: string,
   *   webhookUrl: string,
   *   certificateReady: boolean,
   *   telegramBotTokenConfigured: boolean,
   *   webhookRegistered: boolean,
   *   webhookPendingUpdateCount: number,
   *   webhookLastErrorMessage: string,
   *   selectedCertificateDomain: string,
   *   tlsFullchainPath: string,
   *   tlsPrivkeyPath: string,
   *   checks: {
   *     certificate_ready: boolean,
   *     telegram_bot_token_configured: boolean,
   *     webhook_configured: boolean,
   *     webhook_registered: boolean
   *   }
   * }>} 聚合状态结果。
   */
  async function resolveStatusSnapshot() {
    const config = await configService.getConfigs([
      'webhook_base_url',
      'webhook_path',
      'selected_certificate_domain',
      'tls_fullchain_path',
      'tls_privkey_path',
      'telegram_bot_token'
    ]);
    const webhookUrl = buildWebhookUrl(config.webhook_base_url, config.webhook_path);
    const certificateReady = Boolean(config.tls_fullchain_path && config.tls_privkey_path);
    const telegramBotTokenConfigured = Boolean(config.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN);
    const webhookConfigured = Boolean(webhookUrl);
    let webhookRegistered = false;
    let webhookPendingUpdateCount = 0;
    let webhookLastErrorMessage = '';

    if (webhookConfigured && typeof telegramApiService.getWebhookInfo === 'function') {
      try {
        const webhookInfoResponse = await telegramApiService.getWebhookInfo();
        const currentWebhookUrl =
          webhookInfoResponse &&
          webhookInfoResponse.result &&
          typeof webhookInfoResponse.result.url === 'string'
            ? webhookInfoResponse.result.url
            : '';

        webhookRegistered = currentWebhookUrl === webhookUrl;
        webhookPendingUpdateCount = Number(
          webhookInfoResponse &&
            webhookInfoResponse.result &&
            webhookInfoResponse.result.pending_update_count !== undefined
            ? webhookInfoResponse.result.pending_update_count
            : 0
        );
        webhookLastErrorMessage =
          webhookInfoResponse &&
          webhookInfoResponse.result &&
          typeof webhookInfoResponse.result.last_error_message === 'string'
            ? webhookInfoResponse.result.last_error_message
            : '';
      } catch (error) {
        webhookLastErrorMessage = error.message || '读取 Telegram webhook 信息失败';
        logger.warn(`读取 Telegram webhook 信息失败 error=${webhookLastErrorMessage}`);
      }
    }

    let status = 'ready';

    if (!certificateReady || !telegramBotTokenConfigured || !webhookConfigured) {
      status = 'pending';
    } else if (!webhookRegistered || webhookLastErrorMessage) {
      status = 'degraded';
    }

    return {
      status,
      webhookUrl,
      certificateReady,
      telegramBotTokenConfigured,
      webhookRegistered,
      webhookPendingUpdateCount,
      webhookLastErrorMessage,
      selectedCertificateDomain: config.selected_certificate_domain || '',
      tlsFullchainPath: config.tls_fullchain_path || '',
      tlsPrivkeyPath: config.tls_privkey_path || '',
      checks: {
        certificate_ready: certificateReady,
        telegram_bot_token_configured: telegramBotTokenConfigured,
        webhook_configured: webhookConfigured,
        webhook_registered: webhookRegistered
      }
    };
  }

  /**
   * 返回管理员状态摘要。
   * @param {import('express').Request} _req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @param {import('express').NextFunction} next - Express 下一个中间件。
   * @returns {Promise<void>}
   */
  async function getStatus(_req, res, next) {
    try {
      const snapshot = await resolveStatusSnapshot();

      logger.info(`返回管理员真实状态摘要 status=${snapshot.status}`);
      res.json(
        ok({
          status: snapshot.status,
          webhook_url: snapshot.webhookUrl,
          certificate_ready: snapshot.certificateReady,
          telegram_bot_token_configured: snapshot.telegramBotTokenConfigured,
          webhook_registered: snapshot.webhookRegistered,
          webhook_pending_update_count: snapshot.webhookPendingUpdateCount,
          webhook_last_error_message: snapshot.webhookLastErrorMessage,
          checks: snapshot.checks
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * 返回管理员概览状态。
   * @param {import('express').Request} _req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @param {import('express').NextFunction} next - Express 下一个中间件。
   * @returns {Promise<void>}
   */
  async function getOverview(_req, res, next) {
    try {
      const snapshot = await resolveStatusSnapshot();

      logger.info('返回管理员状态概览');
      res.json(
        ok({
          webhook_url: snapshot.webhookUrl,
          selected_certificate_domain: snapshot.selectedCertificateDomain,
          tls_fullchain_path: snapshot.tlsFullchainPath,
          tls_privkey_path: snapshot.tlsPrivkeyPath,
          certificate_ready: snapshot.certificateReady,
          telegram_bot_token_configured: snapshot.telegramBotTokenConfigured,
          webhook_registered: snapshot.webhookRegistered,
          webhook_pending_update_count: snapshot.webhookPendingUpdateCount,
          webhook_last_error_message: snapshot.webhookLastErrorMessage
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * 注册 Telegram Webhook。
   * @param {import('express').Request} _req - Express 请求对象。
   * @param {import('express').Response} res - Express 响应对象。
   * @param {import('express').NextFunction} next - Express 下一个中间件。
   * @returns {Promise<void>}
   */
  async function registerWebhook(_req, res, next) {
    try {
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

      const telegramResult = await telegramApiService.setWebhook({ url: webhookUrl });
      logger.info(`Webhook 注册流程完成，url=${webhookUrl}`);
      res.json(
        ok({
          registered: true,
          webhook_url: webhookUrl,
          telegram_result: telegramResult
        })
      );
    } catch (error) {
      next(error);
    }
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
