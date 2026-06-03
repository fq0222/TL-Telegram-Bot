/**
 * 概述：定义服务端统一 HTTP 错误对象，便于中间件识别状态码和业务消息。
 */

/**
 * HTTP 错误类型。
 */
class HttpError extends Error {
  /**
   * 创建 HTTP 错误实例。
   * @param {number} statusCode - HTTP 状态码，用于错误处理中间件决定响应状态。
   * @param {string} message - 错误消息，用于返回给客户端和记录日志。
    * @param {unknown} details - 可选附加信息，用于保留调试上下文。
   * 4xx 默认视为可对外透传；5xx 默认仅写日志不直接暴露。
   */
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
    this.expose = statusCode < 500;
  }
}

module.exports = {
  HttpError
};
