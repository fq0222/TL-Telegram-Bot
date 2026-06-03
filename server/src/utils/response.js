/**
 * 概述：提供统一的成功与失败响应结构，减少控制器和中间件重复拼装响应体。
 */

/**
 * 创建成功响应对象。
 * @param {unknown} data - 响应数据载荷，默认返回空对象。
 * @param {string} message - 成功消息，默认使用 ok。
 * @returns {{code: number, message: string, data: unknown}} 统一成功响应。
 */
function ok(data = {}, message = 'ok') {
  return {
    code: 0,
    message,
    data
  };
}

/**
 * 创建失败响应对象。
 * @param {number} code - 业务错误码，通常与 HTTP 状态码保持一致。
 * @param {string} message - 错误描述，供调用方展示或排查。
 * @param {unknown} data - 附加错误数据，默认返回 null。
 * @returns {{code: number, message: string, data: unknown}} 统一失败响应。
 */
function fail(code, message, data = null) {
  return {
    code,
    message,
    data
  };
}

module.exports = {
  ok,
  fail
};
