/**
 * 概述：提供内部接口签名所需的签名原文拼接与 HMAC-SHA256 计算能力，确保调用端与服务端使用一致的签名协议。
 */
const crypto = require('node:crypto');

/**
 * 构建内部接口签名原文。
 * 核心分支语义：请求方法统一转为大写；未提供 rawBody 时按空字符串参与拼接，确保空体请求也能稳定签名。
 * @param {{ method: string, path: string, timestamp: string|number, rawBody?: string }} options - 签名原文参数。
 * @returns {string} 按 method/path/timestamp/rawBody 顺序拼接后的签名原文。
 */
function buildSignaturePayload({ method, path, timestamp, rawBody = '' }) {
  return [String(method || '').toUpperCase(), String(path || ''), String(timestamp ?? ''), String(rawBody)].join('\n');
}

/**
 * 计算内部接口请求签名。
 * 核心分支语义：secret 缺失时直接抛错，避免在无密钥场景下生成伪有效签名。
 * @param {{ secret: string, method: string, path: string, timestamp: string|number, rawBody?: string }} options - 签名计算参数。
 * @returns {string} 64 位十六进制 HMAC-SHA256 签名。
 */
function signRequest({ secret, method, path, timestamp, rawBody = '' }) {
  if (typeof secret !== 'string' || secret === '') {
    throw new Error('Internal API signature secret is required');
  }

  const payload = buildSignaturePayload({
    method,
    path,
    timestamp,
    rawBody
  });

  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

module.exports = {
  buildSignaturePayload,
  signRequest
};
