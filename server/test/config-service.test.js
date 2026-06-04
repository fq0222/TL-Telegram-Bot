/**
 * 概述：Task 2 的基础测试文件，用于验证日志工具对外暴露的最小接口。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { createLogger } = require('../src/utils/logger');

test('createLogger should expose info warn error methods', () => {
  const logger = createLogger('Test');

  assert.equal(typeof logger.info, 'function');
  assert.equal(typeof logger.warn, 'function');
  assert.equal(typeof logger.error, 'function');
});

/**
 * 以依赖注入方式加载模块，避免测试受到外部未安装依赖影响。
 * @param {string} relativeModulePath - 相对当前测试文件的目标模块路径。
 * @param {Record<string, unknown>} mocks - 需要替换的依赖映射。
 * @returns {unknown} 加载后的模块导出对象。
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

test('startServer should support injected app and serverFactory', () => {
  const listenCalls = [];
  const fakeServer = {
    listen(port, callback) {
      listenCalls.push(port);
      if (callback) {
        callback();
      }
      return this;
    }
  };
  const fakeApp = { name: 'injected-app' };
  let createAppCalled = 0;
  let serverFactoryApp = null;
  const shutdownRegistrations = [];
  const loadServerEnvCalls = [];

  const { startServer } = loadWithMocks(path.resolve(__dirname, '../src/server.js'), {
    './app': {
      createApp() {
        createAppCalled += 1;
        return { name: 'default-app' };
      }
    },
    './utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error() {}
        };
      }
    },
    './jobs': {
      startAllJobs() {},
      stopAllJobs() {}
    },
    './bootstrap/create-server': {
      createListeningServer({ app, listenPort, serverFactory, onListening }) {
        serverFactoryApp = app;
        const server = serverFactory(app);
        listenCalls.push(listenPort);
        onListening();
        return server;
      }
    },
    './config/env': {
      loadServerEnv(options) {
        loadServerEnvCalls.push(options);
        return {
          host: '0.0.0.0',
          port: 443,
          tlsFullchainPath: '',
          tlsPrivkeyPath: '',
          nodeEnv: 'test'
        };
      }
    },
    './bootstrap/create-runtime': {
      createRuntime() {
        throw new Error('should not be called');
      },
      createJobsRuntime() {
        throw new Error('should not be called');
      },
      resolveAlertPollIntervalMs() {
        return 60000;
      }
    },
    './bootstrap/register-shutdown': (options) => {
        shutdownRegistrations.push(options);
        return async () => {};
      }
  });

  const server = startServer({
    app: fakeApp,
    port: 3456,
    jobsRuntime: {
      scheduler: global,
      database: null
    },
    serverFactory(app) {
      return fakeServer;
    }
  });

  assert.equal(server, fakeServer);
  assert.equal(createAppCalled, 0);
  assert.equal(serverFactoryApp, fakeApp);
  assert.deepEqual(listenCalls, [3456]);
  assert.equal(loadServerEnvCalls.length, 1);
  assert.equal(loadServerEnvCalls[0].configService, undefined);
  assert.equal(shutdownRegistrations.length, 1);
});

test('startServer should start jobs after server begins listening', () => {
  const fakeServer = {
    listen(_port, callback) {
      if (callback) {
        callback();
      }
      return this;
    }
  };
  let startedJobsRuntime = null;
  const loadServerEnvCalls = [];

  const { startServer } = loadWithMocks(path.resolve(__dirname, '../src/server.js'), {
    './app': {
      createApp() {
        return { name: 'default-app' };
      }
    },
    './utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error() {}
        };
      }
    },
    './jobs': {
      startAllJobs(runtime) {
        startedJobsRuntime = runtime;
      },
      stopAllJobs() {}
    },
    './bootstrap/create-server': {
      createListeningServer({ serverFactory, onListening, app }) {
        const server = serverFactory(app);
        onListening();
        return server;
      }
    },
    './config/env': {
      loadServerEnv(options) {
        loadServerEnvCalls.push(options);
        return {
          host: '0.0.0.0',
          port: 443,
          tlsFullchainPath: '',
          tlsPrivkeyPath: '',
          nodeEnv: 'test'
        };
      }
    },
    './bootstrap/create-runtime': {
      createRuntime() {
        throw new Error('should not be called');
      },
      createJobsRuntime() {
        throw new Error('should not be called');
      },
      resolveAlertPollIntervalMs() {
        return 60000;
      }
    },
    './bootstrap/register-shutdown': () => {
        return async () => {};
      }
  });

  const jobsRuntime = {
    scheduler: global,
    database: null
  };
  startServer({
    app: { name: 'injected-app' },
    port: 3456,
    jobsRuntime,
    serverFactory() {
      return fakeServer;
    }
  });

  assert.equal(startedJobsRuntime, jobsRuntime);
  assert.equal(loadServerEnvCalls[0].configService, undefined);
});

test('startServer should build app from unified runtime and inject configService into env loader', () => {
  const createdApps = [];
  const createdAdminRoutes = [];
  const loadServerEnvCalls = [];
  let startedJobsRuntime = null;
  const runtime = {
    database: { close() {} },
    configService: { getConfigsSync() { return {}; } },
    sessionRepository: { getSession() {}, saveSession() {} },
    loginAttemptService: { assertAttemptAllowed() {}, registerAttempt() {} },
    certificateService: { listDomains() {}, activateDomain() {} },
    telegramApiService: { setWebhook() {}, getWebhookInfo() {} },
    commandService: { handleUpdate() {} },
    telegramAlertPollingService: { pollOnce() {} },
    alertPollIntervalMs: 3600000,
    scheduler: global
  };

  const { startServer } = loadWithMocks(path.resolve(__dirname, '../src/server.js'), {
    './app': {
      createApp(options) {
        createdApps.push(options);
        return { name: 'runtime-app' };
      }
    },
    './routes/admin-routes': {
      createAdminRoutes(options) {
        createdAdminRoutes.push(options);
        return { name: 'admin-routes' };
      }
    },
    './config/env': {
      loadServerEnv(options) {
        loadServerEnvCalls.push(options);
        return {
          host: '127.0.0.1',
          port: 9443,
          tlsFullchainPath: '',
          tlsPrivkeyPath: '',
          nodeEnv: 'test'
        };
      }
    },
    './bootstrap/create-runtime': {
      createRuntime() {
        return runtime;
      },
      createJobsRuntime() {
        throw new Error('should not be called');
      },
      resolveAlertPollIntervalMs() {
        return 3600000;
      }
    },
    './bootstrap/create-server': {
      createListeningServer({ app, onListening, listenPort }) {
        assert.equal(app.name, 'runtime-app');
        assert.equal(listenPort, 9443);
        onListening();
        return {
          close(callback) {
            if (callback) {
              callback();
            }
          }
        };
      }
    },
    './bootstrap/register-shutdown': () => async () => {},
    './jobs': {
      startAllJobs(injectedRuntime) {
        startedJobsRuntime = injectedRuntime;
      },
      stopAllJobs() {}
    },
    './utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error() {}
        };
      }
    }
  });

  startServer();

  assert.equal(loadServerEnvCalls.length, 1);
  assert.equal(loadServerEnvCalls[0].configService, runtime.configService);
  assert.equal(createdAdminRoutes.length, 1);
  assert.equal(createdAdminRoutes[0].configService, runtime.configService);
  assert.equal(createdAdminRoutes[0].sessionRepository, runtime.sessionRepository);
  assert.equal(createdAdminRoutes[0].loginAttemptService, runtime.loginAttemptService);
  assert.equal(createdAdminRoutes[0].certificateService, runtime.certificateService);
  assert.equal(createdAdminRoutes[0].telegramApiService, runtime.telegramApiService);
  assert.equal(createdApps.length, 1);
  assert.equal(createdApps[0].commandService, runtime.commandService);
  assert.deepEqual(createdApps[0].adminRoutes, { name: 'admin-routes' });
  assert.equal(startedJobsRuntime, runtime);
});

test('errorHandler should hide internal message and details for unknown 5xx errors', () => {
  let responseStatusCode = null;
  let responsePayload = null;
  const req = {
    method: 'GET',
    originalUrl: '/secret'
  };
  const res = {
    status(statusCode) {
      responseStatusCode = statusCode;
      return this;
    },
    json(payload) {
      responsePayload = payload;
      return this;
    }
  };
  const logs = [];
  const { errorHandler } = loadWithMocks(path.resolve(__dirname, '../src/middlewares/error-handler.js'), {
    '../utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error(message) {
            logs.push(message);
          }
        };
      }
    }
  });

  errorHandler(
    Object.assign(new Error('database password leaked'), {
      details: { password: 'super-secret' }
    }),
    req,
    res,
    () => {}
  );

  assert.equal(responseStatusCode, 500);
  assert.deepEqual(responsePayload, {
    code: 500,
    message: '服务器内部错误',
    data: null
  });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /database password leaked/);
});

test('createConfigService should save and read config through repository', async () => {
  const storedConfigs = new Map();
  const repository = {
    async saveConfigs(entries) {
      return entries.map((entry) => {
        const nextConfig = {
          key: entry.key,
          value: entry.value,
          updatedAt: '2026-06-03 00:00:00'
        };

        storedConfigs.set(nextConfig.key, nextConfig);
        return nextConfig;
      });
    },
    async getConfig(key) {
      return storedConfigs.get(key) || null;
    }
  };
  const { createConfigService } = require('../src/services/config-service');
  const service = createConfigService({ repository });

  const savedConfig = await service.saveConfig({
    key: 'bot.webhook.url',
    value: 'https://bot.example.com/webhook'
  });
  const loadedConfig = await service.getConfig('bot.webhook.url');

  assert.deepEqual(savedConfig, {
    key: 'bot.webhook.url',
    value: 'https://bot.example.com/webhook',
    updatedAt: '2026-06-03 00:00:00'
  });
  assert.deepEqual(loadedConfig, savedConfig);
});

test('loadSqliteModule should return injected sqlite module', () => {
  const sqliteModule = { DatabaseSync: class FakeDatabaseSync {} };
  const { loadSqliteModule } = require('../src/config/database');

  const loadedModule = loadSqliteModule({ sqliteModule });

  assert.equal(loadedModule, sqliteModule);
});

test('loadSqliteModule should throw diagnostic error when sqlite driver loading fails', () => {
  const { loadSqliteModule } = require('../src/config/database');

  assert.throws(
    () =>
      loadSqliteModule({
        moduleLoader() {
          throw new Error('module missing');
        }
      }),
    /Failed to load SQLite module/
  );
});

test('createDatabase should support injected databaseFactory', () => {
  const executedSql = [];
  const mkdirCalls = [];
  const databaseInstance = {
    exec(sql) {
      executedSql.push(sql);
    }
  };
  const { createDatabase } = require('../src/config/database');

  const createdDatabase = createDatabase({
    filename: 'F:/web-project/TL-Telegram-Bot/server/data/test.sqlite',
    initSqlPath: 'F:/web-project/TL-Telegram-Bot/server/src/storage/init.sql',
    fsModule: {
      mkdirSync(targetPath, options) {
        mkdirCalls.push({ targetPath, options });
      },
      readFileSync() {
        return 'CREATE TABLE injected_test(id INTEGER);';
      }
    },
    databaseFactory(filename, loadedModule) {
      assert.equal(filename, 'F:/web-project/TL-Telegram-Bot/server/data/test.sqlite');
      assert.equal(typeof loadedModule.DatabaseSync, 'function');
      return databaseInstance;
    },
    sqliteModule: {
      DatabaseSync: class FakeDatabaseSync {}
    }
  });

  assert.equal(createdDatabase, databaseInstance);
  assert.equal(mkdirCalls.length, 1);
  assert.deepEqual(executedSql, ['CREATE TABLE injected_test(id INTEGER);']);
});

test('createConfigService should trim keys and save configs in batch through repository', async () => {
  const repositoryCalls = [];
  const repository = {
    async saveConfig(config) {
      repositoryCalls.push({ type: 'single', config });
      return {
        key: config.key,
        value: config.value,
        updatedAt: '2026-06-03 10:00:00'
      };
    },
    async saveConfigs(entries) {
      repositoryCalls.push({ type: 'batch', entries });
      return entries.map((entry) => ({
        key: entry.key,
        value: entry.value,
        updatedAt: '2026-06-03 10:00:00'
      }));
    },
    async getConfig(key) {
      return {
        key,
        value: 'stored-value',
        updatedAt: '2026-06-03 10:00:00'
      };
    }
  };
  const { createConfigService } = require('../src/services/config-service');
  const service = createConfigService({ repository });

  const savedConfigs = await service.saveConfigs([
    { key: '  bot.webhook.url  ', value: 'https://bot.example.com/webhook' },
    { key: '\n bot.name\t', value: 'telegram-bot' }
  ]);
  const savedConfig = await service.saveConfig({
    key: '  app.mode  ',
    value: 'production'
  });
  const loadedConfig = await service.getConfig('  app.mode  ');

  assert.deepEqual(repositoryCalls, [
    {
      type: 'batch',
      entries: [
        { key: 'bot.webhook.url', value: 'https://bot.example.com/webhook' },
        { key: 'bot.name', value: 'telegram-bot' }
      ]
    },
    {
      type: 'batch',
      entries: [{ key: 'app.mode', value: 'production' }]
    }
  ]);
  assert.deepEqual(savedConfigs, [
    {
      key: 'bot.webhook.url',
      value: 'https://bot.example.com/webhook',
      updatedAt: '2026-06-03 10:00:00'
    },
    {
      key: 'bot.name',
      value: 'telegram-bot',
      updatedAt: '2026-06-03 10:00:00'
    }
  ]);
  assert.deepEqual(savedConfig, {
    key: 'app.mode',
    value: 'production',
    updatedAt: '2026-06-03 10:00:00'
  });
  assert.deepEqual(loadedConfig, {
    key: 'app.mode',
    value: 'stored-value',
    updatedAt: '2026-06-03 10:00:00'
  });
});

test('createConfigService should reject invalid config input before calling repository', async () => {
  const repository = {
    async saveConfig() {
      throw new Error('should not be called');
    },
    async saveConfigs() {
      throw new Error('should not be called');
    },
    async getConfig() {
      throw new Error('should not be called');
    }
  };
  const { createConfigService } = require('../src/services/config-service');
  const service = createConfigService({ repository });

  await assert.rejects(() => service.saveConfig({ key: '   ', value: 'test' }), /Config key is required/);
  await assert.rejects(() => service.saveConfigs('invalid'), /Config entries must be a non-empty array/);
  await assert.rejects(
    () => service.saveConfigs([{ key: ' valid.key ', value: 1 }]),
    /Config value must be a string/
  );
  await assert.rejects(() => service.getConfig('   '), /Config key is required/);
});

test('createConfigRepository should save configs in batch and get saved config', async () => {
  const state = new Map();
  const executedRuns = [];
  const executedGets = [];
  const database = {
    prepare(sql) {
      if (sql.includes('INSERT INTO system_configs')) {
        return {
          run(key, value) {
            executedRuns.push({ key, value });
            state.set(key, {
              key,
              value,
              updatedAt: `2026-06-03 10:00:0${executedRuns.length}`
            });
          },
          get(key, value) {
            executedRuns.push({ key, value });
            const saved = {
              key,
              value,
              updatedAt: '2026-06-03 10:00:09'
            };

            state.set(key, saved);
            return saved;
          }
        };
      }

      if (sql.includes('SELECT')) {
        return {
          get(key) {
            executedGets.push(key);
            return state.get(key) || null;
          }
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
    transaction(handler) {
      return (entries) => handler(entries);
    }
  };
  const { createConfigRepository } = require('../src/repositories/config-repository');
  const repository = createConfigRepository({ database });

  const savedConfigs = await repository.saveConfigs([
    { key: 'bot.webhook.url', value: 'https://bot.example.com/webhook' },
    { key: 'bot.name', value: 'telegram-bot' }
  ]);
  const loadedConfig = await repository.getConfig('bot.name');

  assert.deepEqual(executedRuns, [
    { key: 'bot.webhook.url', value: 'https://bot.example.com/webhook' },
    { key: 'bot.name', value: 'telegram-bot' }
  ]);
  assert.deepEqual(savedConfigs, [
    {
      key: 'bot.webhook.url',
      value: 'https://bot.example.com/webhook',
      updatedAt: '2026-06-03 10:00:01'
    },
    {
      key: 'bot.name',
      value: 'telegram-bot',
      updatedAt: '2026-06-03 10:00:02'
    }
  ]);
  assert.equal(executedGets.length, 3);
  assert.deepEqual(executedGets, ['bot.webhook.url', 'bot.name', 'bot.name']);
  assert.deepEqual(loadedConfig, {
    key: 'bot.name',
    value: 'telegram-bot',
    updatedAt: '2026-06-03 10:00:02'
  });
});
