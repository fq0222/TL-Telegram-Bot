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

/**
 * 将 Unix 时间戳格式化为 YYYY-MM-DD_HH-mm-ss 文本。
 * @param {string|number} unixSeconds - 秒级 Unix 时间戳。
 * @returns {string} 格式化后的时间文本；若入参非法则返回空字符串。
 */
function formatUnixTimestamp(unixSeconds) {
  const timestamp = Number(unixSeconds);

  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const date = new Date(timestamp * 1000);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const values = parts.reduce((result, item) => {
    if (item.type !== 'literal') {
      result[item.type] = item.value;
    }

    return result;
  }, {});

  return `${values.year}-${values.month}-${values.day}_${values.hour}-${values.minute}-${values.second}`;
}

module.exports = {
  getLocalTime,
  formatUnixTimestamp
};
