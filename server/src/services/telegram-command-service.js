/**
 * 概述：提供 Telegram 文本命令识别与 update 归一化处理骨架，供 webhook 控制器后续接入具体业务分发。
 */
const { createLogger } = require('../utils/logger');

const logger = createLogger('TelegramCommandService');

/**
 * 创建 Telegram 命令服务。
 * @returns {{ parseCommand: Function, handleUpdate: Function }} 命令服务实例。
 */
function createTelegramCommandService() {
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
   * 处理 Telegram update 的最小命令识别流程。
   * 核心分支语义：优先读取 message.text；识别到命令时写入日志并回传归一化结果；未识别命令仍标记为已处理，便于 webhook 快速确认。
   * @param {{ update_id?: number, message?: { text?: string } }} update - Telegram 标准 update 载荷。
   * @returns {{ processed: boolean, updateId: number | null, command: {command: string, argument: string} | null }} 最小处理结果。
   */
  function handleUpdate(update = {}) {
    const text = update.message && typeof update.message.text === 'string' ? update.message.text : '';
    const command = parseCommand(text);
    const updateId = Number.isInteger(update.update_id) ? update.update_id : null;

    if (command) {
      logger.info(`识别到 Telegram 命令 ${command.command}，updateId=${updateId === null ? 'unknown' : updateId}`);
    } else {
      logger.info(`未识别 Telegram 命令，updateId=${updateId === null ? 'unknown' : updateId}`);
    }

    return {
      processed: true,
      updateId,
      command
    };
  }

  return {
    parseCommand,
    handleUpdate
  };
}

module.exports = {
  createTelegramCommandService
};
