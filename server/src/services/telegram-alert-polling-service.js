/**
 * 概述：提供 Telegram 告警轮询的单次执行逻辑，供 jobs 层统一调度。
 */
const { createLogger } = require('../utils/logger');
const { createInternalApiService } = require('./internal-api-service');

const logger = createLogger('TelegramAlertPollingService');

/**
 * 读取当前告警轮询所需的内部接口配置。
 * @param {{ getConfigs: Function }} configService - 配置服务。
 * @returns {Promise<{ baseUrl: string, secret: string }>} 轮询 Internal API 所需配置。
 */
async function resolveInternalApiConfig(configService) {
  const config = await configService.getConfigs(['internal_api_base_url', 'internal_api_secret']);

  return {
    baseUrl: String(config.internal_api_base_url || process.env.INTERNAL_API_BASE_URL || '').trim(),
    secret: String(config.internal_api_secret || process.env.INTERNAL_API_SECRET || '').trim()
  };
}

/**
 * 安全提取对象字符串字段。
 * @param {Record<string, unknown>} source - 来源对象。
 * @param {string} key - 字段名称。
 * @returns {string} 去首尾空白后的字符串值。
 */
function getString(source, key) {
  return source && typeof source[key] === 'string' ? source[key].trim() : '';
}

/**
 * 构建 Telegram 告警通知文本。
 * @param {Record<string, unknown>} alert - 待发送告警对象。
 * @returns {string} 可直接发送给 Telegram 的文本。
 */
function buildAlertMessage(alert) {
  const serverId = alert.server_id === undefined || alert.server_id === null ? '-' : String(alert.server_id);

  return [
    '告警通知',
    `服务器：${getString(alert, 'server_name') || '-'}（ID: ${serverId}）`,
    `类型：${getString(alert, 'alert_type') || '-'}`,
    `标题：${getString(alert, 'title') || '-'}`,
    `详情：${getString(alert, 'message') || '-'}`
  ].join('\n');
}

/**
 * 创建 Telegram 告警轮询服务。
 * 核心分支语义：仅消费主业务侧已判定为待发送的告警，不在 Bot 侧重复推断健康状态。
 * @param {{
 *   configService?: { getConfigs: Function },
 *   internalApiServiceFactory?: Function,
 *   telegramApiService?: { sendMessage?: Function },
 *   fetchImpl?: Function,
 *   pendingLimit?: number
 * }} [options] - 轮询服务依赖。
 * @returns {{ pollOnce: Function }} 告警轮询服务实例。
 */
function createTelegramAlertPollingService(options = {}) {
  const configService = options.configService || {
    async getConfigs() {
      return {
        internal_api_base_url: '',
        internal_api_secret: ''
      };
    }
  };
  const internalApiServiceFactory = options.internalApiServiceFactory || createInternalApiService;
  const telegramApiService = options.telegramApiService || null;
  const fetchImpl = options.fetchImpl || global.fetch;
  const pendingLimit = Number.isInteger(options.pendingLimit) && options.pendingLimit > 0 ? options.pendingLimit : 10;
  let polling = false;

  /**
   * 执行单次告警轮询。
   * @returns {Promise<{ ok: boolean, polled: number, notified: number }>} 本次轮询摘要。
   */
  async function pollOnce() {
    if (polling) {
      logger.warn('跳过告警轮询：上一轮轮询尚未完成');
      return {
        ok: false,
        polled: 0,
        notified: 0
      };
    }

    polling = true;

    try {
      if (!telegramApiService || typeof telegramApiService.sendMessage !== 'function') {
        logger.warn('跳过告警轮询：telegramApiService 不可用');
        return {
          ok: false,
          polled: 0,
          notified: 0
        };
      }

      const internalApiConfig = await resolveInternalApiConfig(configService);

      if (!internalApiConfig.baseUrl || !internalApiConfig.secret) {
        logger.warn('跳过告警轮询：缺少内部接口配置');
        return {
          ok: false,
          polled: 0,
          notified: 0
        };
      }

      const internalApiService = internalApiServiceFactory({
        baseUrl: internalApiConfig.baseUrl,
        secret: internalApiConfig.secret,
        fetchImpl
      });
      const response = await internalApiService.request({
        method: 'GET',
        path: `/api/internal/telegram/alerts/pending?limit=${pendingLimit}`,
        parseAs: 'json'
      });
      const list =
        response && response.code === 0 && response.data && Array.isArray(response.data.list) ? response.data.list : [];
      let notified = 0;

      for (const alert of list) {
        const recipients = Array.isArray(alert.recipients) ? alert.recipients : [];
        const messageText = buildAlertMessage(alert);
        const sendResults = [];

        for (const recipient of recipients) {
          const chatId = getString(recipient, 'chat_id');

          if (!chatId) {
            continue;
          }

          try {
            const telegramResponse = await telegramApiService.sendMessage({
              chatId,
              text: messageText
            });

            sendResults.push({
              success: true,
              messageId:
                telegramResponse &&
                telegramResponse.result &&
                telegramResponse.result.message_id !== undefined &&
                telegramResponse.result.message_id !== null
                  ? String(telegramResponse.result.message_id)
                  : ''
            });
          } catch (error) {
            sendResults.push({
              success: false,
              errorMessage: error.message
            });
          }
        }

        const deliveredCount = sendResults.filter((item) => item.success).length;
        const firstSuccessfulResult = sendResults.find((item) => item.success) || null;

        await internalApiService.request({
          method: 'POST',
          path: `/api/internal/telegram/alerts/${encodeURIComponent(String(alert.alert_id || ''))}/sent`,
          body: {
            result_status: deliveredCount > 0 ? 'sent' : 'failed',
            delivered_count: deliveredCount,
            telegram_message_id: firstSuccessfulResult ? firstSuccessfulResult.messageId : '',
            result_message:
              deliveredCount > 0
                ? 'ok'
                : sendResults
                    .map((item) => item.errorMessage)
                    .filter(Boolean)
                    .join('; ')
          },
          parseAs: 'json'
        });

        if (deliveredCount > 0) {
          notified += 1;
        }
      }

      return {
        ok: true,
        polled: list.length,
        notified
      };
    } finally {
      polling = false;
    }
  }

  return {
    pollOnce
  };
}

module.exports = {
  buildAlertMessage,
  createTelegramAlertPollingService
};
