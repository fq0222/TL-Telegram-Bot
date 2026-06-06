/**
 * 概述：服务端顶层启动入口，只负责组装运行时、创建应用、注册关闭流程并启动监听。
 */
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { AppBuilder, createApp } = require('./app');
const { ListeningServer, createListeningServer } = require('./bootstrap/create-server');
const { JobsRuntime, Runtime, createJobsRuntime, createRuntime, resolveAlertPollIntervalMs } = require('./bootstrap/create-runtime');
const registerShutdown = require('./bootstrap/register-shutdown');
const { loadServerEnv } = require('./config/env');
const { startAllJobs, stopAllJobs } = require('./jobs');
const { AdminRoutes, createAdminRoutes } = require('./routes/admin-routes');
const { createLogger } = require('./utils/logger');

const logger = createLogger('Server');

/**
 * 构建 Express 应用实例。
 * @param {ConstructorParameters<typeof AppBuilder>[0]} options - 应用依赖注入项。
 * @returns {unknown} Express 应用实例。
 */
function buildApplication(options) {
  if (typeof AppBuilder === 'function') {
    return new AppBuilder(options).build();
  }

  return createApp(options);
}

/**
 * 启动监听服务。
 * @param {ConstructorParameters<typeof ListeningServer>[0]} options - 监听服务依赖注入项。
 * @returns {import('http').Server | import('https').Server} 已启动服务实例。
 */
function startListeningServer(options) {
  if (typeof ListeningServer === 'function') {
    return new ListeningServer(options).start();
  }

  const listeningServer = createListeningServer(options);

  return listeningServer && typeof listeningServer.start === 'function' ? listeningServer.start() : listeningServer;
}

/**
 * 创建统一运行时。
 * @param {ConstructorParameters<typeof Runtime>[0]} options - 运行时依赖注入项。
 * @returns {Runtime | object} 运行时对象。
 */
function buildRuntime(options) {
  if (typeof Runtime === 'function') {
    return new Runtime(options);
  }

  return createRuntime(options);
}

/**
 * 创建管理员路由实例。
 * @param {{
 *   expressLib?: Function & { Router?: Function },
 *   runtime: Runtime,
 *   devAuth?: { token?: string, adminId?: string, sessionId?: string, tokenType?: string }
 * }} options - 管理员路由所需依赖。
 * @returns {unknown} 管理员路由实例。
 */
function createRuntimeAdminRoutes(options) {
  const routeOptions = {
    expressLib: options.expressLib,
    devAuth: options.devAuth,
    loginAttemptService: options.runtime.loginAttemptService,
    configService: options.runtime.configService,
    sessionRepository: options.runtime.sessionRepository,
    certificateService: options.runtime.certificateService,
    telegramApiService: options.runtime.telegramApiService
  };

  if (typeof AdminRoutes === 'function') {
    return new AdminRoutes(routeOptions).getRouter();
  }

  return createAdminRoutes(routeOptions);
}

/**
 * 启动服务。
 * 核心分支语义：优先支持显式注入的 runtime/app/serverFactory 便于测试；
 * 服务监听成功后统一拉起 jobs，并复用同一份数据库与配置服务。
 * @param {{
 *   app?: unknown,
 *   env?: NodeJS.ProcessEnv,
 *   port?: number,
 *   httpModule?: { createServer: Function },
 *   httpsModule?: { createServer: Function },
 *   httpsStateService?: { resolveTlsState: Function },
 *   runtime?: Runtime | null,
 *   jobsRuntime?: JobsRuntime | Runtime | null,
 *   processObject?: NodeJS.Process,
 *   serverFactory?: Function
 * }} [options] - 可选启动参数。
 * @returns {import('http').Server | import('https').Server} 已启动的服务实例。
 */
function startServer(options = {}) {
  let runtime = options.runtime || options.jobsRuntime || null;

  if (!runtime) {
    try {
      runtime = buildRuntime({
        env: options.env,
        fetchImpl: global.fetch
      });
    } catch (error) {
      logger.warn(`创建统一运行时失败，将跳过后台任务启动：${error.message}`);
      runtime = null;
    }
  }

  const runtimeEnv = loadServerEnv({
    env: options.env,
    configService: runtime ? runtime.configService : undefined
  });
  const listenPort = Number.isInteger(options.port) && options.port > 0 ? options.port : runtimeEnv.port;
  const app =
    options.app ||
    buildApplication({
      adminRoutes: runtime
        ? createRuntimeAdminRoutes({
            runtime
          })
        : undefined,
      commandService: runtime ? runtime.commandService : undefined
    });

  let appServer = null;
  registerShutdown({
    logger,
    stopAllJobs: () => stopAllJobs(runtime ? runtime.scheduler : global),
    databaseManager: runtime ? runtime.database : null,
    getServers() {
      return {
        appServer
      };
    },
    processObject: options.processObject || process
  });

  appServer = startListeningServer({
    app,
    runtimeEnv,
    listenPort,
    httpModule: options.httpModule,
    httpsModule: options.httpsModule,
    httpsStateService: options.httpsStateService,
    serverFactory: options.serverFactory,
    onListening() {
      if (runtime) {
        startAllJobs(runtime);
      }
    }
  });

  return appServer;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  JobsRuntime,
  Runtime,
  buildRuntime,
  buildApplication,
  createJobsRuntime,
  createRuntime,
  createRuntimeAdminRoutes,
  resolveAlertPollIntervalMs,
  startListeningServer,
  startServer
};
