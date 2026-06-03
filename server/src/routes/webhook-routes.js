/**
 * 概述：聚合 Telegram Webhook 路由骨架，当前提供 POST /telegram/webhook 并注入命令服务与控制器依赖。
 */
const { createWebhookController } = require('../controllers/webhook-controller');
const { createTelegramCommandService } = require('../services/telegram-command-service');

/**
 * 创建 Telegram Webhook 路由。
 * @param {{ expressLib?: Function & { Router?: Function }, commandService?: { handleUpdate: Function } }} [options] - 路由依赖，支持注入 express 与命令服务。
 * @returns {import('express').Router | {post: Function}} Telegram Webhook 路由实例。
 */
function createWebhookRoutes(options = {}) {
  const expressLib = options.expressLib || require('express');
  const router = expressLib.Router();
  const commandService = options.commandService || createTelegramCommandService();
  const webhookController = createWebhookController({ commandService });

  router.post('/webhook', webhookController.handleTelegramWebhook);

  return router;
}

module.exports = {
  createWebhookRoutes
};
