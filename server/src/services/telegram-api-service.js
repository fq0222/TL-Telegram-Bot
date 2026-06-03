/**
 * 概述：封装 Telegram Bot API 的真实 HTTP 调用，
 * 负责解析 bot token、统一请求日志、校验响应并向调用方返回标准 Telegram 结果。
 */
const { createLogger } = require('../utils/logger');

const logger = createLogger('TelegramApiService');
const DEFAULT_TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

/**
 * 创建可公开返回的业务异常。
 * @param {number} statusCode - 建议返回的 HTTP 状态码。
 * @param {string} message - 面向调用方的错误消息。
 * @param {unknown} [details=null] - 附加错误详情。
 * @returns {Error & { statusCode: number, expose: true, details: unknown }} 统一异常对象。
 */
function createExposedError(statusCode, message, details = null) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.expose = true;
  error.details = details;
  return error;
}

/**
 * 安全解析 Telegram 响应体。
 * @param {{ status: number, headers?: { get?: Function }, json?: Function, text?: Function }} response - fetch 响应对象。
 * @returns {Promise<unknown>} 已解析的响应体。
 */
async function parseTelegramResponse(response) {
  const contentType =
    response && response.headers && typeof response.headers.get === 'function'
      ? String(response.headers.get('content-type') || '').toLowerCase()
      : '';

  if (contentType.includes('application/json') && typeof response.json === 'function') {
    return response.json();
  }

  if (typeof response.text === 'function') {
    const rawText = await response.text();

    try {
      return JSON.parse(rawText);
    } catch (_error) {
      return rawText;
    }
  }

  return null;
}

/**
 * 将 Telegram 响应体规整为可读摘要。
 * @param {unknown} body - 待摘要的响应体。
 * @returns {string} 适合拼接到日志与错误消息中的摘要文本。
 */
function buildBodySummary(body) {
  if (body === null || body === undefined || body === '') {
    return 'empty response body';
  }

  if (typeof body === 'string') {
    return body;
  }

  try {
    return JSON.stringify(body);
  } catch (_error) {
    return String(body);
  }
}

/**
 * 创建 Telegram API 服务。
 * @param {{
 *   botToken?: string,
 *   configService?: { getConfigs?: Function },
 *   fetchImpl?: Function,
 *   apiBaseUrl?: string
 * }} [options] - Telegram 服务依赖与配置。
 * @returns {{ sendMessage: Function, setWebhook: Function, getWebhookInfo: Function }} Telegram API 服务实例。
 */
function createTelegramApiService(options = {}) {
  const configuredBotToken = typeof options.botToken === 'string' ? options.botToken.trim() : '';
  const configService = options.configService || null;
  const fetchImpl = options.fetchImpl || global.fetch;
  const apiBaseUrl = String(options.apiBaseUrl || DEFAULT_TELEGRAM_API_BASE_URL).replace(/\/+$/, '');

  if (typeof fetchImpl !== 'function') {
    throw new Error('TelegramApiService requires fetchImpl');
  }

  /**
   * 解析当前应使用的 Telegram Bot Token。
   * 核心分支语义：优先使用显式注入 token；否则读取 SQLite 配置；仍为空时回退到环境变量。
   * @returns {Promise<string>} 已规整的 Bot Token，若缺失则返回空字符串。
   */
  async function resolveBotToken() {
    if (configuredBotToken) {
      return configuredBotToken;
    }

    if (configService && typeof configService.getConfigs === 'function') {
      const config = await configService.getConfigs(['telegram_bot_token']);
      const persistedToken = typeof config.telegram_bot_token === 'string' ? config.telegram_bot_token.trim() : '';

      if (persistedToken) {
        return persistedToken;
      }
    }

    return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  }

  /**
   * 调用 Telegram Bot API。
   * 核心分支语义：缺少 token 时抛出 400；HTTP 非 2xx 或 Telegram `ok !== true` 时抛出可公开错误。
   * @param {{ methodName: string, payload: Record<string, unknown> }} options - Telegram 方法名与请求体。
   * @returns {Promise<any>} Telegram 原始 JSON 响应。
   */
  async function callTelegramApi({ methodName, payload }) {
    const botToken = await resolveBotToken();

    if (!botToken) {
      logger.warn(`Telegram API 调用失败：未配置 bot token method=${methodName}`);
      throw createExposedError(400, '未配置 Telegram Bot Token');
    }

    const requestUrl = `${apiBaseUrl}/bot${botToken}/${methodName}`;
    const requestBody = JSON.stringify(payload);

    logger.info(`发起 Telegram API 请求 method=${methodName}`);
    const response = await fetchImpl(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: requestBody
    });
    const responseBody = await parseTelegramResponse(response);

    if (!response.ok) {
      logger.error(`Telegram API HTTP 请求失败 method=${methodName} status=${response.status}`);
      throw createExposedError(
        502,
        `Telegram API request failed with status ${response.status}: ${buildBodySummary(responseBody)}`,
        responseBody
      );
    }

    if (!responseBody || typeof responseBody !== 'object' || responseBody.ok !== true) {
      logger.error(`Telegram API 业务响应失败 method=${methodName} body=${buildBodySummary(responseBody)}`);
      throw createExposedError(
        502,
        `Telegram API returned an invalid response: ${buildBodySummary(responseBody)}`,
        responseBody
      );
    }

    logger.info(`Telegram API 调用成功 method=${methodName}`);
    return responseBody;
  }

  /**
   * 发送 Telegram 文本消息。
   * @param {{ chatId: number|string, text: string, parseMode?: string }} payload - 发送消息参数。
   * @returns {Promise<any>} Telegram sendMessage 响应。
   */
  async function sendMessage(payload) {
    const chatId =
      payload && payload.chatId !== undefined && payload.chatId !== null ? String(payload.chatId).trim() : '';
    const text = payload && typeof payload.text === 'string' ? payload.text.trim() : '';

    if (!chatId || !text) {
      throw createExposedError(400, 'Telegram sendMessage 缺少 chatId 或 text');
    }

    const requestPayload = {
      chat_id: chatId,
      text
    };

    if (payload && typeof payload.parseMode === 'string' && payload.parseMode.trim() !== '') {
      requestPayload.parse_mode = payload.parseMode.trim();
    }

    return callTelegramApi({
      methodName: 'sendMessage',
      payload: requestPayload
    });
  }

  /**
   * 注册 Telegram Webhook。
   * @param {{ url: string }} payload - Webhook 注册参数。
   * @returns {Promise<any>} Telegram setWebhook 响应。
   */
  async function setWebhook(payload) {
    const webhookUrl = payload && typeof payload.url === 'string' ? payload.url.trim() : '';

    if (!webhookUrl) {
      throw createExposedError(400, 'Telegram webhook 地址不能为空');
    }

    return callTelegramApi({
      methodName: 'setWebhook',
      payload: {
        url: webhookUrl
      }
    });
  }

  /**
   * 查询当前 Telegram Webhook 信息。
   * @returns {Promise<any>} Telegram getWebhookInfo 响应。
   */
  async function getWebhookInfo() {
    return callTelegramApi({
      methodName: 'getWebhookInfo',
      payload: {}
    });
  }

  return {
    sendMessage,
    setWebhook,
    getWebhookInfo
  };
}

module.exports = {
  createTelegramApiService
};
