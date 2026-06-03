/**
 * 概述：提供统一日志工具，按仓库约定输出模块名、级别和上海时区时间。
 */
const { getLocalTime } = require('./time');

/**
 * 创建模块级日志工具。
 * @param {string} moduleName - 日志所属模块名称，用于快速定位日志来源。
 * @returns {{info: Function, warn: Function, error: Function}} 包含统一格式日志方法的对象。
 */
function createLogger(moduleName) {
  /**
   * 按统一格式输出日志。
   * @param {'INFO'|'WARN'|'ERROR'} level - 日志级别，用于区分正常、警告和错误分支。
   * @param {string} message - 需要输出的日志内容。
   */
  function write(level, message) {
    const content = `[${moduleName}] [${level}] ${getLocalTime()} - ${message}`;

    if (level === 'ERROR') {
      console.error(content);
      return;
    }

    if (level === 'WARN') {
      console.warn(content);
      return;
    }

    console.log(content);
  }

  return {
    info(message) {
      write('INFO', message);
    },
    warn(message) {
      write('WARN', message);
    },
    error(message) {
      write('ERROR', message);
    }
  };
}

module.exports = {
  createLogger
};
