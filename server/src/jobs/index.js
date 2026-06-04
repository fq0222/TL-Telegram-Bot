/**
 * 概述：统一注册、持有并清理后台任务句柄，避免任务启动与停止逻辑散落在各处。
 */
const { registerTelegramAlertPollingJob } = require('./handlers/telegram-alert-polling-job');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Jobs');
const intervals = [];
const timeouts = [];
const cronTasks = [];
let isStarted = false;
let activeScheduler = global;

/**
 * 注册间隔任务句柄。
 * @param {Function} callback - 间隔执行函数。
 * @param {number} delay - 间隔毫秒数。
 * @param {{ setInterval: Function }} scheduler - 定时器实现。
 * @returns {NodeJS.Timeout | unknown} interval 句柄。
 */
function registerInterval(callback, delay, scheduler) {
  const interval = scheduler.setInterval(callback, delay);

  if (interval && typeof interval.unref === 'function') {
    interval.unref();
  }

  intervals.push(interval);
  return interval;
}

/**
 * 注册延迟任务句柄。
 * @param {Function} callback - 延迟执行函数。
 * @param {number} delay - 延迟毫秒数。
 * @param {{ setTimeout: Function }} scheduler - 定时器实现。
 * @returns {NodeJS.Timeout | unknown} timeout 句柄。
 */
function registerTimeout(callback, delay, scheduler) {
  const timeout = scheduler.setTimeout(async () => {
    try {
      await callback();
    } finally {
      const index = timeouts.indexOf(timeout);

      if (index !== -1) {
        timeouts.splice(index, 1);
      }
    }
  }, delay);

  if (timeout && typeof timeout.unref === 'function') {
    timeout.unref();
  }

  timeouts.push(timeout);
  return timeout;
}

/**
 * 清理当前已注册的任务句柄。
 * @param {{ clearInterval: Function, clearTimeout: Function }} scheduler - 定时器实现。
 * @returns {void}
 */
function cleanupJobHandles(scheduler) {
  intervals.forEach((interval) => scheduler.clearInterval(interval));
  intervals.length = 0;

  timeouts.forEach((timeout) => scheduler.clearTimeout(timeout));
  timeouts.length = 0;

  cronTasks.forEach((task) => task.stop());
  cronTasks.length = 0;
}

/**
 * 启动所有后台任务。
 * @param {{ scheduler?: { setInterval: Function, clearInterval: Function, setTimeout: Function, clearTimeout: Function } }} runtime - 运行期依赖。
 * @returns {void}
 */
function startAllJobs(runtime) {
  if (isStarted) {
    logger.warn('定时任务已启动，跳过重复注册');
    return;
  }

  const scheduler = runtime && runtime.scheduler ? runtime.scheduler : global;
  activeScheduler = scheduler;

  logger.info('正在启动所有定时任务...');

  try {
    const context = {
      runtime,
      scheduler,
      intervals,
      timeouts,
      cronTasks,
      registerInterval(callback, delay) {
        return registerInterval(callback, delay, scheduler);
      },
      registerTimeout(callback, delay) {
        return registerTimeout(callback, delay, scheduler);
      }
    };

    registerTelegramAlertPollingJob(context);
  } catch (error) {
    cleanupJobHandles(scheduler);
    logger.error(`启动定时任务失败: ${error.message}`);
    throw error;
  }

  isStarted = true;
  logger.info(`所有定时任务已启动，共 ${intervals.length} 个间隔任务，${cronTasks.length} 个定时任务`);
}

/**
 * 停止所有后台任务。
 * @param {{ clearInterval: Function, clearTimeout: Function }} [scheduler=global] - 定时器实现。
 * @returns {void}
 */
function stopAllJobs(scheduler = activeScheduler) {
  logger.info('正在停止所有定时任务...');

  cleanupJobHandles(scheduler);
  isStarted = false;
  activeScheduler = global;

  logger.info('所有定时任务已停止');
}

module.exports = {
  cleanupJobHandles,
  registerInterval,
  registerTimeout,
  startAllJobs,
  stopAllJobs
};
