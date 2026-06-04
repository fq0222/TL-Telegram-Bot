/**
 * 概述：注册 Telegram 告警轮询任务，统一由 jobs 注册中心管理首次执行与后续周期调度。
 */
const { createLogger } = require('../../utils/logger');

const logger = createLogger('TelegramAlertPollingJob');

/**
 * 注册 Telegram 告警轮询任务。
 * 核心分支语义：启动时先异步触发一次立即轮询，后续再按固定间隔重复执行。
 * @param {{
 *   runtime: { alertPollIntervalMs: number, telegramAlertPollingService: { pollOnce: Function } },
 *   registerTimeout: Function,
 *   registerInterval?: Function,
 *   scheduler: { setInterval: Function },
 *   intervals: unknown[]
 * }} context - 任务注册上下文。
 * @returns {void}
 */
function registerTelegramAlertPollingJob(context) {
  const pollIntervalMs = Number(context.runtime && context.runtime.alertPollIntervalMs) || 60000;
  const pollingService = context.runtime && context.runtime.telegramAlertPollingService;

  if (!pollingService || typeof pollingService.pollOnce !== 'function') {
    logger.warn('跳过 Telegram 告警轮询任务：缺少可用的轮询服务');
    return;
  }

  context.registerTimeout(async () => {
    try {
      await pollingService.pollOnce();
    } catch (error) {
      logger.error(`首次 Telegram 告警轮询失败: ${error.message}`);
    }
  }, 0);

  const intervalCallback = async () => {
    try {
      await pollingService.pollOnce();
    } catch (error) {
      logger.error(`定时 Telegram 告警轮询失败: ${error.message}`);
    }
  };

  if (typeof context.registerInterval === 'function') {
    context.registerInterval(intervalCallback, pollIntervalMs);
    return;
  }

  context.intervals.push(context.scheduler.setInterval(intervalCallback, pollIntervalMs));
}

module.exports = {
  registerTelegramAlertPollingJob
};
