/**
 * 概述：统一组装服务启动阶段需要的运行时依赖，
 * 包括数据库、配置服务、管理端依赖、Telegram 命令服务与后台任务运行时。
 */
const { createDatabase } = require('../config/database');
const { createConfigRepository } = require('../repositories/config-repository');
const { createSessionRepository } = require('../repositories/session-repository');
const { createConfigService } = require('../services/config-service');
const { createAdminLoginAttemptService } = require('../services/admin-login-attempt-service');
const { createCertificateService } = require('../services/certificate-service');
const { createTelegramAlertPollingService } = require('../services/telegram-alert-polling-service');
const { createTelegramApiService } = require('../services/telegram-api-service');
const { createTelegramCommandService } = require('../services/telegram-command-service');
const { resolveCertificateServiceOptions } = require('../routes/admin-routes');

/**
 * 解析告警轮询间隔毫秒数。
 * @param {NodeJS.ProcessEnv | undefined} env - 运行时环境变量。
 * @returns {number} 规整后的轮询间隔毫秒数。
 */
function resolveAlertPollIntervalMs(env) {
  const intervalSeconds = Number(env && env.ALERT_POLL_INTERVAL_SECONDS);

  if (!Number.isInteger(intervalSeconds) || intervalSeconds <= 0) {
    return 60000;
  }

  return intervalSeconds * 1000;
}

/**
 * 统一运行时对象，集中表达服务启动阶段的对象生命周期。
 */
class Runtime {
  /**
   * 创建统一运行时上下文。
   * 核心分支语义：数据库只创建一次，其余服务全部基于同一份 database/configService 派生，
   * 避免启动阶段重复建库与重复初始化。
   * @param {{
   *   env?: NodeJS.ProcessEnv,
   *   fetchImpl?: Function,
   *   scheduler?: { setInterval: Function, clearInterval: Function, setTimeout: Function, clearTimeout: Function },
   *   database?: { close?: Function }
   * }} [options] - 启动阶段依赖注入项。
   */
  constructor(options = {}) {
    this.database = options.database || createDatabase();
    this.configRepository = createConfigRepository({ database: this.database });
    this.sessionRepository = createSessionRepository({ database: this.database });
    this.configService = createConfigService({ repository: this.configRepository });

    const fetchImpl = options.fetchImpl || global.fetch;

    this.loginAttemptService = createAdminLoginAttemptService();
    this.certificateService = createCertificateService(resolveCertificateServiceOptions());
    this.telegramApiService = createTelegramApiService({
      configService: this.configService,
      fetchImpl
    });
    this.telegramAlertPollingService = createTelegramAlertPollingService({
      configService: this.configService,
      telegramApiService: this.telegramApiService,
      fetchImpl
    });
    this.commandService = createTelegramCommandService({
      configService: this.configService,
      telegramApiService: this.telegramApiService,
      fetchImpl
    });
    this.alertPollIntervalMs = resolveAlertPollIntervalMs(options.env || process.env);
    this.scheduler = options.scheduler || global;
  }
}

/**
 * 后台任务运行时对象，当前复用统一运行时的依赖装配。
 */
class JobsRuntime extends Runtime {
  /**
   * 创建后台任务运行时上下文。
   * 核心分支语义：保留独立类名，便于后续 jobs 专属依赖扩展时不影响主服务启动链。
   * @param {ConstructorParameters<typeof Runtime>[0]} [options] - 运行时注入参数。
   */
  constructor(options = {}) {
    super(options);
  }
}

/**
 * 创建统一运行时上下文的迁移期兼容包装。
 * @param {ConstructorParameters<typeof Runtime>[0]} [options] - 启动阶段依赖注入项。
 * @returns {Runtime} 统一运行时上下文。
 */
function createRuntime(options = {}) {
  return new Runtime(options);
}

/**
 * 创建后台任务运行时上下文的迁移期兼容包装。
 * @param {ConstructorParameters<typeof JobsRuntime>[0]} [options] - 运行时注入参数。
 * @returns {JobsRuntime} 后台任务运行时。
 */
function createJobsRuntime(options = {}) {
  return new JobsRuntime(options);
}

module.exports = {
  JobsRuntime,
  Runtime,
  createRuntime,
  createJobsRuntime,
  resolveAlertPollIntervalMs
};
