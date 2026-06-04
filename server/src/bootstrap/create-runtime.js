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
 * 创建统一运行时上下文。
 * 核心分支语义：数据库只创建一次，其余服务全部基于同一份 database/configService 派生，
 * 避免启动阶段重复建库与重复初始化。
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: Function,
 *   scheduler?: { setInterval: Function, clearInterval: Function, setTimeout: Function, clearTimeout: Function },
 *   database?: { close?: Function }
 * }} [options] - 启动阶段依赖注入项。
 * @returns {{
 *   database: { close?: Function },
 *   configRepository: { getConfig?: Function, saveConfigs?: Function },
 *   sessionRepository: { saveSession?: Function, getSession?: Function },
 *   configService: { getConfigs: Function },
 *   loginAttemptService: { assertAttemptAllowed?: Function, registerAttempt?: Function },
 *   certificateService: { listDomains: Function, activateDomain: Function },
 *   telegramApiService: { sendMessage?: Function, setWebhook?: Function, getWebhookInfo?: Function },
 *   telegramAlertPollingService: { pollOnce: Function },
 *   commandService: { handleUpdate: Function, parseCommand?: Function },
 *   alertPollIntervalMs: number,
 *   scheduler: { setInterval: Function, clearInterval: Function, setTimeout: Function, clearTimeout: Function }
 * }} 统一运行时上下文。
 */
function createRuntime(options = {}) {
  const database = options.database || createDatabase();
  const configRepository = createConfigRepository({ database });
  const sessionRepository = createSessionRepository({ database });
  const configService = createConfigService({ repository: configRepository });
  const fetchImpl = options.fetchImpl || global.fetch;
  const telegramApiService = createTelegramApiService({
    configService,
    fetchImpl
  });
  const telegramAlertPollingService = createTelegramAlertPollingService({
    configService,
    telegramApiService,
    fetchImpl
  });
  const commandService = createTelegramCommandService({
    configService,
    telegramApiService,
    fetchImpl
  });

  return {
    database,
    configRepository,
    sessionRepository,
    configService,
    loginAttemptService: createAdminLoginAttemptService(),
    certificateService: createCertificateService(resolveCertificateServiceOptions()),
    telegramApiService,
    telegramAlertPollingService,
    commandService,
    alertPollIntervalMs: resolveAlertPollIntervalMs(options.env || process.env),
    scheduler: options.scheduler || global
  };
}

/**
 * 创建后台任务运行时上下文。
 * 为兼容既有 jobs 调用方，当前直接复用统一 runtime。
 * @param {object} [options] - 运行时注入参数。
 * @returns {ReturnType<typeof createRuntime>} 后台任务运行时。
 */
function createJobsRuntime(options = {}) {
  return createRuntime(options);
}

module.exports = {
  createRuntime,
  createJobsRuntime,
  resolveAlertPollIntervalMs
};
