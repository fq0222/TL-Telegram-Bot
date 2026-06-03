/**
 * 概述：提供 Telegram 文本命令识别、管理员鉴权前置检查与内部 API 分发能力，
 * 让 Webhook 收到命令后可以直接联调后端 INTERNAL_API_BASE_URL。
 */
const { createLogger } = require('../utils/logger');
const { createInternalApiService } = require('./internal-api-service');

const logger = createLogger('TelegramCommandService');

/**
 * 创建 Telegram 命令服务。
 * @param {{
 *   configService?: { getConfigs: Function },
 *   internalApiServiceFactory?: Function,
 *   fetchImpl?: Function
 * }} [options] - 命令服务依赖；支持注入配置读取、内部接口工厂与 fetch 实现，便于联调与测试。
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

  /**
   * 解析消息文本中的已支持命令。
   * 核心分支语义：精确匹配无参命令；对带参命令仅在命令后有空格时视为合法前缀；未识别命令返回 null。
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
   * 核心分支语义：优先使用 SQLite 中已保存的管理员配置；为空时回退到环境变量，方便本地直接联调。
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
   * @param {{ message?: { chat?: { id?: number|string, type?: string }, from?: { id?: number|string, username?: string, first_name?: string, last_name?: string } } }} update - Telegram 标准 update 载荷。
   * @returns {{
   *   chatId: string,
   *   telegramUserId: string,
   *   telegramUsername: string,
   *   telegramFirstName: string,
   *   telegramLastName: string
   * }} 会话与用户上下文。
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
   * @param {Record<string, string>} query - 查询参数对象；空值会被过滤掉。
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
   * 核心分支语义：除 /bind 外的管理员命令都先走 by-chat 鉴权；未绑定时直接短路，不继续请求目标业务接口。
   * @param {{ request: Function }} internalApiService - 内部接口客户端。
   * @param {string} chatId - Telegram 会话 ID。
   * @returns {Promise<unknown>} 内部接口鉴权结果。
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
   * 核心分支语义：/bind 直接校验绑定码；其余管理员命令先鉴权，再转发到各自内部接口。
   * @param {{ request: Function }} internalApiService - 内部接口客户端。
   * @param {{ command: string, argument: string }} command - 已解析的 Telegram 命令。
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
   * 处理 Telegram update 的命令识别与内部接口联调流程。
   * 核心分支语义：优先读取 message.text；识别到命令时按文档打到内部接口；联调失败不会让 webhook 崩溃，而是返回可观测的错误结果。
   * @param {{ update_id?: number, message?: { text?: string } }} update - Telegram 标准 update 载荷。
   * @returns {Promise<{ processed: boolean, updateId: number | null, command: {command: string, argument: string} | null, dispatch?: unknown }>} 归一化处理结果。
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

      logger.info(`Telegram 命令内部接口联调完成 command=${command.command} updateId=${updateId === null ? 'unknown' : updateId}`);
      return {
        processed: true,
        updateId,
        command,
        dispatch: {
          attempted: true,
          ok: true,
          ...dispatchResult
        }
      };
    } catch (error) {
      logger.error(
        `Telegram 命令内部接口联调失败 command=${command.command} updateId=${updateId === null ? 'unknown' : updateId} error=${error.message}`
      );

      return {
        processed: true,
        updateId,
        command,
        dispatch: {
          attempted: true,
          ok: false,
          error: error.message
        }
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
