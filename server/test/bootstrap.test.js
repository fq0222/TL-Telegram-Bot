/**
 * 概述：覆盖 bootstrap 层的运行时组装、服务创建与优雅关闭注册逻辑。
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

test('createRuntime should assemble unified runtime and create database once', () => {
  const created = {};
  let databaseCreateCount = 0;
  const { createRuntime, createJobsRuntime, resolveAlertPollIntervalMs } = loadWithMocks(
    path.resolve(__dirname, '../src/bootstrap/create-runtime.js'),
    {
      '../config/database': {
        createDatabase() {
          databaseCreateCount += 1;
          created.database = { close() {} };
          return created.database;
        }
      },
      '../repositories/session-repository': {
        createSessionRepository({ database }) {
          created.sessionRepositoryArg = database;
          return { type: 'session-repo' };
        }
      },
      '../repositories/config-repository': {
        createConfigRepository({ database }) {
          created.repositoryArg = database;
          return { type: 'repo' };
        }
      },
      '../services/admin-login-attempt-service': {
        createAdminLoginAttemptService() {
          return { type: 'login-attempt-service' };
        }
      },
      '../services/certificate-service': {
        createCertificateService(options) {
          created.certificateOptions = options;
          return { type: 'certificate-service' };
        }
      },
      '../services/config-service': {
        createConfigService({ repository }) {
          created.configRepository = repository;
          return { type: 'config-service' };
        }
      },
      '../services/telegram-command-service': {
        createTelegramCommandService({ configService, telegramApiService, fetchImpl }) {
          created.commandServiceArgs = { configService, telegramApiService, fetchImpl };
          return { handleUpdate() {} };
        }
      },
      '../services/telegram-api-service': {
        createTelegramApiService({ configService, fetchImpl }) {
          created.telegramApiArgs = { configService, fetchImpl };
          return { sendMessage() {} };
        }
      },
      '../services/telegram-alert-polling-service': {
        createTelegramAlertPollingService({ configService, telegramApiService, fetchImpl }) {
          created.alertPollingArgs = { configService, telegramApiService, fetchImpl };
          return { pollOnce() {} };
        }
      },
      '../routes/admin-routes': {
        resolveCertificateServiceOptions() {
          return { acmeBasePath: '/acme', tlsRootPath: '/tls' };
        }
      }
    }
  );

  const scheduler = {
    setInterval() {},
    clearInterval() {},
    setTimeout() {},
    clearTimeout() {}
  };
  const fetchImpl = () => {};
  const runtime = createRuntime({
    env: {
      ALERT_POLL_INTERVAL_SECONDS: '3600'
    },
    fetchImpl,
    scheduler
  });

  assert.equal(resolveAlertPollIntervalMs({ ALERT_POLL_INTERVAL_SECONDS: '3600' }), 3600000);
  assert.equal(databaseCreateCount, 1);
  assert.equal(runtime.database, created.database);
  assert.deepEqual(runtime.configRepository, { type: 'repo' });
  assert.deepEqual(runtime.sessionRepository, { type: 'session-repo' });
  assert.deepEqual(runtime.configService, { type: 'config-service' });
  assert.deepEqual(runtime.telegramApiService, { sendMessage: created.telegramApiArgs.fetchImpl ? runtime.telegramApiService.sendMessage : undefined });
  assert.equal(created.repositoryArg, created.database);
  assert.equal(created.sessionRepositoryArg, created.database);
  assert.deepEqual(created.configRepository, { type: 'repo' });
  assert.deepEqual(runtime.loginAttemptService, { type: 'login-attempt-service' });
  assert.deepEqual(runtime.certificateService, { type: 'certificate-service' });
  assert.deepEqual(created.certificateOptions, { acmeBasePath: '/acme', tlsRootPath: '/tls' });
  assert.equal(created.telegramApiArgs.configService, runtime.configService);
  assert.equal(created.telegramApiArgs.fetchImpl, fetchImpl);
  assert.equal(created.alertPollingArgs.configService, runtime.configService);
  assert.equal(created.alertPollingArgs.telegramApiService, runtime.telegramApiService);
  assert.equal(created.alertPollingArgs.fetchImpl, fetchImpl);
  assert.equal(created.commandServiceArgs.configService, runtime.configService);
  assert.equal(created.commandServiceArgs.telegramApiService, runtime.telegramApiService);
  assert.equal(created.commandServiceArgs.fetchImpl, fetchImpl);
  assert.equal(runtime.alertPollIntervalMs, 3600000);
  assert.equal(runtime.scheduler, scheduler);
  assert.equal(createJobsRuntime({ database: created.database, fetchImpl, scheduler }).database, created.database);
});

test('createListeningServer should honor injected serverFactory and invoke onListening', () => {
  const listenCalls = [];
  const fakeServer = {
    listen(port, hostOrCallback, callback) {
      listenCalls.push({ port, hostOrCallbackType: typeof hostOrCallback, callbackType: typeof callback });
      if (typeof hostOrCallback === 'function') {
        hostOrCallback();
      } else if (typeof callback === 'function') {
        callback();
      }
      return this;
    }
  };
  let onListeningCalled = 0;
  const { createListeningServer } = loadWithMocks(path.resolve(__dirname, '../src/bootstrap/create-server.js'), {
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

  const server = createListeningServer({
    app: { name: 'app' },
    runtimeEnv: { host: '0.0.0.0', tlsFullchainPath: '', tlsPrivkeyPath: '' },
    listenPort: 3456,
    serverFactory() {
      return fakeServer;
    },
    onListening() {
      onListeningCalled += 1;
    }
  });

  assert.equal(server, fakeServer);
  assert.equal(onListeningCalled, 1);
  assert.equal(listenCalls.length, 1);
});
