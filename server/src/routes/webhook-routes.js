/**
 * 概述：聚合 Telegram Webhook 路由骨架，当前提供 POST /telegram/webhook 并注入命令服务与控制器依赖。
 */
const { createWebhookController } = require('../controllers/webhook-controller');
const { createTelegramCommandService } = require('../services/telegram-command-service');

/**
 * Telegram Webhook 路由对象。
 */
class WebhookRoutes {
  /**
   * 创建 Telegram Webhook 路由。
   * 核心分支语义：优先使用外部注入的 commandService，未注入时创建默认命令服务。
   * @param {{ expressLib?: Function & { Router?: Function }, commandService?: { handleUpdate: Function } }} [options] - 路由依赖。
   */
  constructor(options = {}) {
    this.expressLib = options.expressLib || require('express');
    this.router = this.expressLib.Router();
    this.commandService = options.commandService || createTelegramCommandService();
    this.webhookController = createWebhookController({ commandService: this.commandService });

    this.getRouter = this.getRouter.bind(this);
    this.registerRoutes();
  }

  /**
   * 注册 Telegram Webhook 路由处理器。
   * @returns {void}
   */
  registerRoutes() {
    this.router.post('/webhook', this.webhookController.handleTelegramWebhook);
  }

  /**
   * 返回 Express Router 实例。
   * @returns {import('express').Router | {post: Function}} Telegram Webhook 路由实例。
   */
  getRouter() {
    return this.router;
  }
}

/**
 * 创建 Telegram Webhook 路由的迁移期兼容包装。
 * @param {ConstructorParameters<typeof WebhookRoutes>[0]} [options] - 路由依赖。
 * @returns {import('express').Router | {post: Function}} Telegram Webhook 路由实例。
 */
function createWebhookRoutes(options = {}) {
  return new WebhookRoutes(options).getRouter();
}

module.exports = {
  WebhookRoutes,
  createWebhookRoutes
};
