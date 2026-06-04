/**
 * 概述：覆盖任务注册中心的启动、停止与 Telegram 告警轮询任务注册行为。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

/**
 * 以依赖注入方式加载模块，避免测试受外部依赖影响。
 * @param {string} relativeModulePath - 目标模块路径。
 * @param {Record<string, unknown>} mocks - 依赖替身映射。
 * @returns {unknown} 模块导出对象。
 */
function loadWithMocks(relativeModulePath, mocks) {
  const modulePath = require.resolve(relativeModulePath);
  const originalLoad = Module._load;

  delete require.cache[modulePath];
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }
}

test('startAllJobs should register telegram alert polling job and stopAllJobs should cleanup handles', async () => {
  const intervalHandles = [];
  const clearedIntervals = [];
  let capturedJobContext = null;
  const fakeScheduler = {
    setInterval(callback, delay) {
      const handle = { type: 'interval', callback, delay };
      intervalHandles.push(handle);
      return handle;
    },
    clearInterval(handle) {
      clearedIntervals.push(handle);
    },
    setTimeout,
    clearTimeout
  };
  const { startAllJobs, stopAllJobs } = loadWithMocks(path.resolve(__dirname, '../src/jobs/index.js'), {
    './handlers/telegram-alert-polling-job': {
      registerTelegramAlertPollingJob(context) {
        capturedJobContext = context;
        context.intervals.push(
          context.scheduler.setInterval(async () => {
            await context.runtime.telegramAlertPollingService.pollOnce();
          }, context.runtime.alertPollIntervalMs)
        );
      }
    },
    '../utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error() {}
        };
      }
    }
  });

  const pollCalls = [];
  const runtime = {
    scheduler: fakeScheduler,
    alertPollIntervalMs: 3600000,
    telegramAlertPollingService: {
      async pollOnce() {
        pollCalls.push('polled');
      }
    }
  };

  startAllJobs(runtime);
  assert.ok(capturedJobContext);
  assert.equal(intervalHandles.length, 1);
  assert.equal(intervalHandles[0].delay, 3600000);

  await intervalHandles[0].callback();
  assert.deepEqual(pollCalls, ['polled']);

  stopAllJobs();
  assert.deepEqual(clearedIntervals, [intervalHandles[0]]);
});

test('registerTelegramAlertPollingJob should trigger an immediate poll and register future interval', async () => {
  const intervalCalls = [];
  const timeoutCalls = [];
  const pollCalls = [];
  const { registerTelegramAlertPollingJob } = require('../src/jobs/handlers/telegram-alert-polling-job');
  const context = {
    runtime: {
      alertPollIntervalMs: 60000,
      telegramAlertPollingService: {
        async pollOnce() {
          pollCalls.push('polled');
        }
      }
    },
    scheduler: {
      setInterval(callback, delay) {
        const handle = { callback, delay };
        intervalCalls.push(handle);
        return handle;
      },
      setTimeout(callback, delay) {
        const handle = { callback, delay };
        timeoutCalls.push(handle);
        return handle;
      }
    },
    intervals: [],
    timeouts: [],
    cronTasks: [],
    registerTimeout(callback, delay) {
      const handle = this.scheduler.setTimeout(callback, delay);
      this.timeouts.push(handle);
      return handle;
    }
  };

  registerTelegramAlertPollingJob(context);

  assert.equal(timeoutCalls.length, 1);
  assert.equal(timeoutCalls[0].delay, 0);
  assert.equal(intervalCalls.length, 1);
  assert.equal(intervalCalls[0].delay, 60000);

  await timeoutCalls[0].callback();
  await intervalCalls[0].callback();
  assert.deepEqual(pollCalls, ['polled', 'polled']);
});
