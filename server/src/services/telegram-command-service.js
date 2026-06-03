/**
 * 概述：提供 Telegram 文本命令识别、管理员绑定前置检查、Internal API 分发与消息回发能力，
 * 让 Webhook 在联调成功后能够真正把处理结果回复给 Telegram 会话。
 */
const { createLogger } = require('../utils/logger');
const { createInternalApiService } = require('./internal-api-service');

const logger = createLogger('TelegramCommandService');

/**
 * 安全提取对象字符串字段。
 * @param {Record<string, unknown>} source - 来源对象。
 * @param {string} key - 字段名。
 * @returns {string} 规整后的字符串值。
 */
function getString(source, key) {
  return source && typeof source[key] === 'string' ? source[key].trim() : '';
}

/**
 * 构建易读的 JSON 文本。
 * @param {unknown} payload - 待序列化内容。
 * @returns {string} 规整后的可读文本。
 */
function stringifyReadable(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (_error) {
    return String(payload);
  }
}

/**
 * 格式化 /status 的回复内容。
 * @param {{ total_servers?: number, healthy_servers?: number, unhealthy_servers?: number }} data - Internal API 返回的数据体。
 * @returns {string} 给 Telegram 用户看的摘要文本。
 */
function formatStatusReply(data = {}) {
  return [
    '服务器状态汇总',
    `总数：${Number(data.total_servers || 0)}`,
    `健康：${Number(data.healthy_servers || 0)}`,
    `异常：${Number(data.unhealthy_servers || 0)}`
  ].join('\n');
}

/**
 * 格式化 /servers 的回复内容。
 * @param {{ servers?: Array<Record<string, unknown>> }} data - Internal API 返回的数据体。
 * @returns {string} 服务器列表文本。
 */
function formatServersReply(data = {}) {
  const servers = Array.isArray(data.servers) ? data.servers : [];

  if (servers.length === 0) {
    return '当前没有可展示的服务器列表';
  }

  return [
    '服务器列表',
    ...servers.map((server, index) => {
      const name =
        getString(server, 'server_name') ||
        getString(server, 'server_host') ||
        String(server.server_id || index + 1);

      return `${index + 1}. ${name}\n面板 API：${getString(server, 'panel_api_status') || 'unknown'}\n面板鉴权：${
        getString(server, 'panel_auth_status') || 'unknown'
      }\nXray：${getString(server, 'xray_runtime_status') || 'unknown'}`;
    })
  ].join('\n');
}

/**
 * 格式化 /alerts 的回复内容。
 * @param {{ list?: Array<Record<string, unknown>> }} data - 告警列表数据。
 * @returns {string} 告警摘要文本。
 */
function formatAlertsReply(data = {}) {
  const list = Array.isArray(data.list) ? data.list : [];

  if (list.length === 0) {
    return '当前没有未处理告警';
  }

  return [
    '未处理告警',
    ...list.map((item, index) => {
      const severity = getString(item, 'severity') || 'unknown';
      const title = getString(item, 'title') || getString(item, 'message') || `告警 ${index + 1}`;

      return `${index + 1}. [${severity}] ${title}`;
    })
  ].join('\n');
}

/**
 * 格式化 /user 的回复内容。
 * @param {Record<string, unknown>} data - 用户详情数据。
 * @returns {string} 用户摘要文本。
 */
function formatUserReply(data = {}) {
  return [
    '用户信息',
    `用户 ID：${data.user_id ?? '-'}`,
    `邮箱：${getString(data, 'email') || '-'}`,
    `状态：${Number(data.enabled || 0) === 1 ? '启用' : '停用'}`,
    `套餐：${getString(data, 'plan_name') || '-'}`,
    `流量：${getString(data, 'traffic_used_text') || '-'} / ${getString(data, 'traffic_limit_text') || '-'}`,
    `到期时间：${data.expire_at || '未设置'}`,
    `同步状态：${data.sync_status ?? '-'}`
  ].join('\n');
}

/**
 * 将 Internal API 结果转换成 Telegram 回复文本。
 * @param {{ command: string, argument: string }} command - 已识别命令。
 * @param {unknown} response - Internal API 成功响应。
 * @returns {string} 可直接发送给 Telegram 的文本。
 */
function buildSuccessReply(command, response) {
  if (!response || typeof response !== 'object') {
    return '命令执行完成，但未返回可展示内容';
  }

  if (response.code !== 0) {
    return `${command.command} 执行失败\n${response.message || '未知错误'}`;
  }

  const data = response.data && typeof response.data === 'object' ? response.data : {};

  if (command.command === 'bind') {
    return [
      data.bound === true ? '绑定成功' : '绑定未完成',
      `管理员：${getString(data, 'username') || '-'}`,
      `角色：${getString(data, 'role') || '-'}`
    ].join('\n');
  }

  if (command.command === 'status') {
    return formatStatusReply(data);
  }

  if (command.command === 'servers') {
    return formatServersReply(data);
  }

  if (command.command === 'server') {
    return `服务器详情\n${stringifyReadable(data)}`;
  }

  if (command.command === 'alerts') {
    return formatAlertsReply(data);
  }

  if (command.command === 'user') {
    return formatUserReply(data);
  }

  return stringifyReadable(data);
}

/**
 * 创建 Telegram 命令服务。
 * @param {{
 *   configService?: { getConfigs: Function },
 *   internalApiServiceFactory?: Function,
 *   telegramApiService?: { sendMessage?: Function },
 *   fetchImpl?: Function
 * }} [options] - 命令服务依赖。
 * @returns {{ parseCommand: Function, handleUpdate: Function }} 命令服务实例。
 */
function createTelegramCommandService(options = {}) {
  const configService = options.configService || {
    async getConfigs() {
      return {
        internal_api_base_url: '',
        internal_api_secret: ''
      };
    }
  };
  const internalApiServiceFactory = options.internalApiServiceFactory || createInternalApiService;
  const fetchImpl = options.fetchImpl || global.fetch;
  const telegramApiService = options.telegramApiService || null;

  /**
   * 解析消息文本中的已支持命令。
   * @param {string} text - Telegram 消息文本。
   * @returns {{command: string, argument: string} | null} 解析后的命令结果。
   */
  function parseCommand(text) {
    if (typeof text !== 'string') {
      return null;
    }

    const normalizedText = text.trim();
    const exactCommandMap = new Map([
      ['/status', 'status'],
      ['/servers', 'servers'],
      ['/alerts', 'alerts']
    ]);

    if (exactCommandMap.has(normalizedText)) {
      return {
        command: exactCommandMap.get(normalizedText),
        argument: ''
      };
    }

    const prefixCommands = [
      { prefix: '/bind ', command: 'bind' },
      { prefix: '/server ', command: 'server' },
      { prefix: '/user ', command: 'user' }
    ];

    for (const item of prefixCommands) {
      if (normalizedText.startsWith(item.prefix)) {
        return {
          command: item.command,
          argument: normalizedText.slice(item.prefix.length).trim()
        };
      }
    }

    return null;
  }

  /**
   * 读取当前命令分发所需的内部接口配置。
   * @returns {Promise<{ baseUrl: string, secret: string }>} 内部接口联调配置。
   */
  async function resolveInternalApiConfig() {
    const config = await configService.getConfigs(['internal_api_base_url', 'internal_api_secret']);
    const baseUrl = String(config.internal_api_base_url || process.env.INTERNAL_API_BASE_URL || '').trim();
    const secret = String(config.internal_api_secret || process.env.INTERNAL_API_SECRET || '').trim();

    return {
      baseUrl,
      secret
    };
  }

  /**
   * 提取 Telegram 会话上下文。
   * @param {{ message?: { chat?: { id?: number|string }, from?: { id?: number|string, username?: string, first_name?: string, last_name?: string } } }} update - 标准 update 载荷。
   * @returns {{ chatId: string, telegramUserId: string, telegramUsername: string, telegramFirstName: string, telegramLastName: string }} 会话与发送者上下文。
   */
  function extractTelegramContext(update = {}) {
    const message = update.message || {};
    const chat = message.chat || {};
    const from = message.from || {};

    return {
      chatId: chat.id === undefined || chat.id === null ? '' : String(chat.id),
      telegramUserId: from.id === undefined || from.id === null ? '' : String(from.id),
      telegramUsername: typeof from.username === 'string' ? from.username : '',
      telegramFirstName: typeof from.first_name === 'string' ? from.first_name : '',
      telegramLastName: typeof from.last_name === 'string' ? from.last_name : ''
    };
  }

  /**
   * 构建查询字符串路径。
   * @param {string} basePath - 不含查询参数的内部接口路径。
   * @param {Record<string, string>} query - 查询参数对象。
   * @returns {string} 带查询参数的内部接口路径。
   */
  function buildQueryPath(basePath, query) {
    const searchParams = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (typeof value === 'string' && value !== '') {
        searchParams.set(key, value);
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  }

  /**
   * 确保当前 chat 已绑定管理员身份。
   * @param {{ request: Function }} internalApiService - 内部接口客户端。
   * @param {string} chatId - Telegram 会话 ID。
   * @returns {Promise<unknown>} 绑定查询结果。
   */
  async function ensureAdminBound(internalApiService, chatId) {
    return internalApiService.request({
      method: 'GET',
      path: `/api/internal/telegram/admin/by-chat/${encodeURIComponent(chatId)}`,
      parseAs: 'json'
    });
  }

  /**
   * 按文档将 Telegram 命令映射到内部接口。
   * @param {{ request: Function }} internalApiService - 内部接口客户端。
   * @param {{ command: string, argument: string }} command - 已解析命令。
   * @param {{ chatId: string, telegramUserId: string, telegramUsername: string, telegramFirstName: string, telegramLastName: string }} context - 当前会话上下文。
   * @returns {Promise<{ request: { method: string, path: string }, response: unknown }>} 分发结果。
   */
  async function dispatchCommand(internalApiService, command, context) {
    if (command.command === 'bind') {
      const bindPath = '/api/internal/telegram/admin/bind/verify';
      const bindResponse = await internalApiService.request({
        method: 'POST',
        path: bindPath,
        body: {
          bind_code: command.argument,
          chat_id: context.chatId,
          telegram_user_id: context.telegramUserId,
          telegram_username: context.telegramUsername,
          telegram_first_name: context.telegramFirstName,
          telegram_last_name: context.telegramLastName
        },
        parseAs: 'json'
      });

      return {
        request: {
          method: 'POST',
          path: bindPath
        },
        response: bindResponse
      };
    }

    const bindingCheckResponse = await ensureAdminBound(internalApiService, context.chatId);

    if (
      !bindingCheckResponse ||
      bindingCheckResponse.code !== 0 ||
      !bindingCheckResponse.data ||
      bindingCheckResponse.data.bound !== true
    ) {
      return {
        request: {
          method: 'GET',
          path: `/api/internal/telegram/admin/by-chat/${encodeURIComponent(context.chatId)}`
        },
        response: bindingCheckResponse
      };
    }

    if (command.command === 'status') {
      const path = buildQueryPath('/api/internal/telegram/servers/health', {
        chat_id: context.chatId
      });

      return {
        request: { method: 'GET', path },
        response: await internalApiService.request({ method: 'GET', path, parseAs: 'json' })
      };
    }

    if (command.command === 'servers') {
      const path = buildQueryPath('/api/internal/telegram/servers/health', {
        chat_id: context.chatId,
        include_servers: '1'
      });

      return {
        request: { method: 'GET', path },
        response: await internalApiService.request({ method: 'GET', path, parseAs: 'json' })
      };
    }

    if (command.command === 'server') {
      const path = buildQueryPath(
        `/api/internal/telegram/servers/health/${encodeURIComponent(command.argument)}`,
        { chat_id: context.chatId }
      );

      return {
        request: { method: 'GET', path },
        response: await internalApiService.request({ method: 'GET', path, parseAs: 'json' })
      };
    }

    if (command.command === 'alerts') {
      const path = buildQueryPath('/api/internal/telegram/alerts', {
        chat_id: context.chatId,
        status: 'open',
        limit: '10'
      });

      return {
        request: { method: 'GET', path },
        response: await internalApiService.request({ method: 'GET', path, parseAs: 'json' })
      };
    }

    if (command.command === 'user') {
      const path = buildQueryPath('/api/internal/telegram/admin/users/lookup', {
        chat_id: context.chatId,
        user_id: /^\d+$/.test(command.argument) ? command.argument : '',
        email: /^\d+$/.test(command.argument) ? '' : command.argument
      });

      return {
        request: { method: 'GET', path },
        response: await internalApiService.request({ method: 'GET', path, parseAs: 'json' })
      };
    }

    return {
      request: {
        method: 'UNKNOWN',
        path: ''
      },
      response: null
    };
  }

  /**
   * 将命令处理结果回发到 Telegram。
   * 核心分支语义：未注入 Telegram API 时跳过回发；回发失败不影响 webhook 主链路成功确认。
   * @param {{ command: string, argument: string }} command - 已识别命令。
   * @param {string} chatId - Telegram 会话 ID。
   * @param {{ response?: unknown }} dispatchResult - 内部接口分发结果。
   * @param {Error | null} error - 分发异常，存在时优先回发错误文本。
   * @returns {Promise<{ attempted: boolean, ok: boolean, messageId?: number, reason?: string, error?: string }>} 回发结果摘要。
   */
  async function sendReplyToTelegram(command, chatId, dispatchResult, error) {
    if (!telegramApiService || typeof telegramApiService.sendMessage !== 'function') {
      return {
        attempted: false,
        ok: false,
        reason: 'telegram_api_unavailable'
      };
    }

    const replyText = error
      ? `命令处理失败\n${error.message || '未知错误'}`
      : buildSuccessReply(command, dispatchResult ? dispatchResult.response : null);

    if (!replyText) {
      return {
        attempted: false,
        ok: false,
        reason: 'empty_reply'
      };
    }

    try {
      const telegramResponse = await telegramApiService.sendMessage({
        chatId,
        text: replyText
      });

      return {
        attempted: true,
        ok: true,
        messageId:
          telegramResponse &&
          telegramResponse.result &&
          Number.isInteger(telegramResponse.result.message_id)
            ? telegramResponse.result.message_id
            : undefined
      };
    } catch (replyError) {
      logger.error(`Telegram 命令结果回发失败 command=${command.command} chatId=${chatId} error=${replyError.message}`);
      return {
        attempted: true,
        ok: false,
        error: replyError.message
      };
    }
  }

  /**
   * 处理 Telegram update 的命令识别、内部接口联调与消息回发流程。
   * @param {{ update_id?: number, message?: { text?: string } }} update - Telegram 标准 update 载荷。
   * @returns {Promise<{ processed: boolean, updateId: number | null, command: {command: string, argument: string} | null, dispatch?: unknown, reply?: unknown }>} 归一化处理结果。
   */
  async function handleUpdate(update = {}) {
    const text = update.message && typeof update.message.text === 'string' ? update.message.text : '';
    const command = parseCommand(text);
    const updateId = Number.isInteger(update.update_id) ? update.update_id : null;

    if (command) {
      logger.info(`识别到 Telegram 命令 ${command.command}，updateId=${updateId === null ? 'unknown' : updateId}`);
    } else {
      logger.info(`未识别 Telegram 命令，updateId=${updateId === null ? 'unknown' : updateId}`);
    }

    if (!command) {
      return {
        processed: true,
        updateId,
        command
      };
    }

    const context = extractTelegramContext(update);

    if (!context.chatId) {
      logger.warn(`Telegram 命令缺少 chat_id，跳过内部接口分发，updateId=${updateId === null ? 'unknown' : updateId}`);
      return {
        processed: true,
        updateId,
        command,
        dispatch: {
          attempted: false,
          ok: false,
          reason: 'missing_chat_id'
        }
      };
    }

    try {
      const internalApiConfig = await resolveInternalApiConfig();

      if (!internalApiConfig.baseUrl || !internalApiConfig.secret) {
        logger.warn(`Telegram 命令分发缺少内部接口配置，updateId=${updateId === null ? 'unknown' : updateId}`);
        return {
          processed: true,
          updateId,
          command,
          dispatch: {
            attempted: false,
            ok: false,
            reason: 'missing_internal_api_config'
          }
        };
      }

      const internalApiService = internalApiServiceFactory({
        baseUrl: internalApiConfig.baseUrl,
        secret: internalApiConfig.secret,
        fetchImpl
      });
      const dispatchResult = await dispatchCommand(internalApiService, command, context);
      const replyResult = await sendReplyToTelegram(command, context.chatId, dispatchResult, null);

      logger.info(`Telegram 命令内部接口联调完成 command=${command.command} updateId=${updateId === null ? 'unknown' : updateId}`);
      return {
        processed: true,
        updateId,
        command,
        dispatch: {
          attempted: true,
          ok: true,
          ...dispatchResult
        },
        reply: replyResult
      };
    } catch (error) {
      logger.error(
        `Telegram 命令内部接口联调失败 command=${command.command} updateId=${updateId === null ? 'unknown' : updateId} error=${error.message}`
      );
      const replyResult = await sendReplyToTelegram(command, context.chatId, null, error);

      return {
        processed: true,
        updateId,
        command,
        dispatch: {
          attempted: true,
          ok: false,
          error: error.message
        },
        reply: replyResult
      };
    }
  }

  return {
    parseCommand,
    handleUpdate
  };
}

module.exports = {
  createTelegramCommandService
};
