/**
 * 概述：覆盖优雅关闭注册器，确保收到关闭信号后会停止任务、关闭服务与数据库。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { registerShutdown } = require('../src/jobs/shutdown');

test('registerShutdown should stop jobs, close server, close database, and exit cleanly', async () => {
  const events = [];
  const processHandlers = {};
  const fakeProcess = {
    on(event, handler) {
      processHandlers[event] = handler;
    },
    exit(code) {
      events.push(`exit:${code}`);
    }
  };
  let timeoutCallback = null;
  const fakeServer = {
    close(callback) {
      events.push('server.close');
      callback();
    }
  };
  const gracefulShutdown = registerShutdown({
    logger: {
      info(message) {
        events.push(`info:${message}`);
      },
      error(message) {
        events.push(`error:${message}`);
      }
    },
    stopAllJobs() {
      events.push('jobs.stop');
    },
    databaseManager: {
      async close() {
        events.push('db.close');
      }
    },
    getServers() {
      return {
        appServer: fakeServer
      };
    },
    processObject: fakeProcess,
    setTimeoutImpl(callback) {
      timeoutCallback = callback;
      return { id: 'timeout-1' };
    },
    clearTimeoutImpl() {
      events.push('timeout.clear');
    }
  });

  assert.equal(typeof gracefulShutdown, 'function');
  assert.equal(typeof processHandlers.SIGINT, 'function');

  await gracefulShutdown('SIGINT');

  assert.equal(typeof timeoutCallback, 'function');
  assert.ok(events.includes('jobs.stop'));
  assert.ok(events.includes('server.close'));
  assert.ok(events.includes('db.close'));
  assert.ok(events.includes('timeout.clear'));
  assert.ok(events.includes('exit:0'));
});
