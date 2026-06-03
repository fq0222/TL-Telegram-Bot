/**
 * 概述：提供 Telegram Webhook 控制器骨架，负责接收标准 update payload、调用命令服务并返回统一成功响应。
 */
const { createLogger } = require('../utils/logger');
const { ok } = require('../utils/response');

const logger = createLogger('WebhookController');

/**
 * 创建 Telegram Webhook 控制器。
 * @param {{ commandService: { handleUpdate: Function } }} dependencies - 控制器依赖，至少包含命令处理服务。
 * @returns {{ handleTelegramWebhook: Function }} Webhook 控制器实例。
 */
function createWebhookController(dependencies = {}) {
  const { commandService } = dependencies;

  if (!commandService || typeof commandService.handleUpdate !== 'function') {
    throw new Error('WebhookController 需要有效的 commandService');
  }

  /**
   * 处理 Telegram Webhook 回调。
   * 核心分支语义：始终将请求体交给命令服务做最小归一化；当前成功分支固定返回 200 与统一结构，满足 Telegram webhook 快速确认要求。
   * @param {import('express').Request & { body?: { update_id?: number } }} req - Express 请求对象，body 为 Telegram update 载荷。
   * @param {import('express').Response} res - Express 响应对象。
   * @returns {void}
   */
  function handleTelegramWebhook(req, res) {
    const update = req.body || {};
    const result = commandService.handleUpdate(update);

    logger.info(`Webhook 回调处理完成，updateId=${result.updateId === null ? 'unknown' : result.updateId}`);
    res.json(ok(result));
  }

  return {
    handleTelegramWebhook
  };
}

module.exports = {
  createWebhookController
};
