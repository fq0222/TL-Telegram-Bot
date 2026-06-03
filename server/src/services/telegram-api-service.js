/**
 * 概述：提供 Telegram Bot API 调用骨架，当前保留发送消息与 webhook 管理入口，供后续接入真实 HTTP 调用实现。
 */
const { createLogger } = require('../utils/logger');

const logger = createLogger('TelegramApiService');

/**
 * 创建 Telegram API 服务。
 * @param {{ botToken?: string }} [options] - API 服务配置，当前仅预留 botToken 供后续真实调用。
 * @returns {{ sendMessage: Function, setWebhook: Function }} Telegram API 服务实例。
 */
function createTelegramApiService(options = {}) {
  const botToken = typeof options.botToken === 'string' ? options.botToken.trim() : '';

  /**
   * 发送 Telegram 文本消息骨架。
   * 核心分支语义：未配置 botToken 时仅记录警告并返回占位结果；已配置时暂不真正发请求，保持接口稳定供后续补全。
   * @param {{ chatId: number|string, text: string }} payload - 发送消息参数，包含目标会话与文本内容。
   * @returns {Promise<{ ok: boolean, mocked: boolean, method: string, payload: {chatId: number|string, text: string} }>} 占位调用结果。
   */
  async function sendMessage(payload) {
    if (!botToken) {
      logger.warn('sendMessage 调用时尚未配置 botToken，返回占位结果');
    } else {
      logger.info('sendMessage 骨架已被调用，后续将补充真实 Telegram HTTP 请求');
    }

    return {
      ok: true,
      mocked: true,
      method: 'sendMessage',
      payload
    };
  }

  /**
   * 设置 Telegram webhook 骨架。
   * 核心分支语义：未配置 botToken 时记录警告；当前仅返回占位成功结果，便于后续在不破坏调用方的情况下演进。
   * @param {{ url: string }} payload - webhook 设置参数，包含 Telegram 回调地址。
   * @returns {Promise<{ ok: boolean, mocked: boolean, method: string, payload: {url: string} }>} 占位调用结果。
   */
  async function setWebhook(payload) {
    if (!botToken) {
      logger.warn('setWebhook 调用时尚未配置 botToken，返回占位结果');
    } else {
      logger.info('setWebhook 骨架已被调用，后续将补充真实 Telegram HTTP 请求');
    }

    return {
      ok: true,
      mocked: true,
      method: 'setWebhook',
      payload
    };
  }

  return {
    sendMessage,
    setWebhook
  };
}

module.exports = {
  createTelegramApiService
};
