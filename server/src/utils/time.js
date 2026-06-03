/**
 * 概述：提供服务端统一时间格式化能力，确保日志输出使用上海时区本地时间。
 */

/**
 * 获取上海时区本地时间字符串。
 * @returns {string} 格式化后的本地时间字符串。
 */
function getLocalTime() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false
  });
}

module.exports = {
  getLocalTime
};
