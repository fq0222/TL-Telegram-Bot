/**
 * 概述：封装 Telegram Bot 调用内部接口时的最小客户端，负责统一 JSON 序列化、签名请求头注入与基础日志记录。
 */
const { createLogger } = require('../utils/logger');
const { signRequest } = require('../utils/signature');

const logger = createLogger('InternalApiService');

/**
 * 创建内部接口客户端。
 * 核心分支语义：优先使用注入的 fetchImpl 便于测试；body 缺失时不发送请求体，但仍参与空字符串签名。
 * @param {{ baseUrl: string, secret: string, fetchImpl: Function, now?: Function }} options - 客户端依赖与配置。
 * @returns {{ request: Function }} 暴露最小 request 方法的内部接口客户端。
 */
function createInternalApiService({ baseUrl, secret, fetchImpl, now = () => Date.now() }) {
  if (typeof baseUrl !== 'string' || baseUrl === '') {
    throw new Error('Internal API baseUrl is required');
  }

  if (typeof secret !== 'string' || secret === '') {
    throw new Error('Internal API secret is required');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Internal API fetchImpl is required');
  }

  /**
   * 规范化请求体与默认请求头。
   * 核心分支语义：显式 rawBody 优先，确保签名原文与实际发送内容完全一致；仅在使用默认 JSON 序列化路径时自动补 Content-Type。
   * @param {{ body?: unknown, rawBody?: string, headers?: Record<string, string> }} options - 请求体配置。
   * @returns {{ rawBody: string, headers: Record<string, string>, shouldSendBody: boolean }} 规范化后的请求体信息。
   */
  function normalizeRequestBody({ body, rawBody, headers = {} }) {
    const normalizedHeaders = { ...headers };

    if (rawBody !== undefined) {
      return {
        rawBody: String(rawBody),
        headers: normalizedHeaders,
        shouldSendBody: true
      };
    }

    if (body === undefined) {
      return {
        rawBody: '',
        headers: normalizedHeaders,
        shouldSendBody: false
      };
    }

    if (!Object.keys(normalizedHeaders).some((key) => key.toLowerCase() === 'content-type')) {
      normalizedHeaders['Content-Type'] = 'application/json';
    }

    return {
      rawBody: JSON.stringify(body),
      headers: normalizedHeaders,
      shouldSendBody: true
    };
  }

  /**
   * 判断响应应按何种方式解析。
   * 核心分支语义：显式 parseAs 优先；否则根据 content-type 自动在 json/text 间选择，避免无脑固定走 json。
   * @param {{ response: { headers?: { get?: Function } }, parseAs?: 'json'|'text' }} options - 解析策略参数。
   * @returns {'json'|'text'} 响应解析方式。
   */
  function resolveParseMode({ response, parseAs }) {
    if (parseAs === 'json' || parseAs === 'text') {
      return parseAs;
    }

    const contentType = response && response.headers && typeof response.headers.get === 'function'
      ? String(response.headers.get('content-type') || '').toLowerCase()
      : '';

    return contentType.includes('application/json') ? 'json' : 'text';
  }

  /**
   * 解析响应体。
   * 核心分支语义：204/205 直接返回 null；其余响应按解析策略进入 json/text 分支。
   * @param {{ response: { status: number, json?: Function, text?: Function, headers?: { get?: Function } }, parseAs?: 'json'|'text' }} options - 响应解析参数。
   * @returns {Promise<unknown>} 解析后的响应结果。
   */
  async function parseResponseBody({ response, parseAs }) {
    if (response.status === 204 || response.status === 205) {
      return null;
    }

    const parseMode = resolveParseMode({ response, parseAs });

    if (parseMode === 'json') {
      return response.json();
    }

    return response.text();
  }

  /**
   * 安全提取非 2xx 响应体，避免 JSON 空体或坏 JSON 先打断统一错误处理。
   * 核心分支语义：优先读取更稳的 text；声明为 JSON 时再尝试 JSON.parse，失败则退回原始文本或解析失败摘要。
   * @param {{ response: { status: number, json?: Function, text?: Function, headers?: { get?: Function } }, parseAs?: 'json'|'text' }} options - 非成功响应解析参数。
   * @returns {Promise<unknown>} 可用于错误摘要的响应体内容。
   */
  async function readErrorResponseBody({ response, parseAs }) {
    if (response.status === 204 || response.status === 205) {
      return null;
    }

    const parseMode = resolveParseMode({ response, parseAs });

    if (parseMode === 'text') {
      try {
        return await response.text();
      } catch (error) {
        return `failed to read response body: ${error.message}`;
      }
    }

    if (typeof response.text === 'function') {
      try {
        const rawText = await response.text();

        if (rawText === '') {
          return null;
        }

        try {
          return JSON.parse(rawText);
        } catch (error) {
          return rawText || `invalid json response body: ${error.message}`;
        }
      } catch (error) {
        return `failed to read response body: ${error.message}`;
      }
    }

    try {
      return await response.json();
    } catch (error) {
      return `invalid json response body: ${error.message}`;
    }
  }

  /**
   * 构建用于错误提示的响应体摘要。
   * 核心分支语义：字符串原样用于摘要；对象响应体优先 JSON 序列化，序列化失败时退回字符串化结果。
   * @param {unknown} responseBody - 已解析响应体。
   * @returns {string} 适合拼接进错误消息的响应体摘要。
   */
  function buildErrorSummary(responseBody) {
    if (responseBody === null || responseBody === undefined || responseBody === '') {
      return 'empty response body';
    }

    if (typeof responseBody === 'string') {
      return responseBody;
    }

    try {
      return JSON.stringify(responseBody);
    } catch (error) {
      return String(responseBody);
    }
  }

  /**
   * 发送内部接口请求。
   * 核心分支语义：默认保留 JSON 请求路径，但允许显式 rawBody、headers 与 parseAs，避免将 JSON 序列化模式写死为唯一行为。
   * @param {{ method: string, path: string, body?: unknown, rawBody?: string, headers?: Record<string, string>, parseAs?: 'json'|'text' }} options - 请求参数。
   * @returns {Promise<unknown>} 按响应解析策略得到的结果；204/205 返回 null。
   */
  async function request({ method, path, body, rawBody, headers, parseAs }) {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const timestamp = String(now());
    const normalizedRequestBody = normalizeRequestBody({
      body,
      rawBody,
      headers
    });
    const signature = signRequest({
      secret,
      method: normalizedMethod,
      path,
      timestamp,
      rawBody: normalizedRequestBody.rawBody
    });
    const requestHeaders = {
      'X-Internal-Client': 'telegram-bot',
      'X-Internal-Timestamp': timestamp,
      'X-Internal-Signature': signature,
      ...normalizedRequestBody.headers
    };
    const requestOptions = {
      method: normalizedMethod,
      headers: requestHeaders
    };

    if (normalizedRequestBody.shouldSendBody) {
      requestOptions.body = normalizedRequestBody.rawBody;
    }

    logger.info(`发起内部接口请求：${normalizedMethod} ${path}`);
    const response = await fetchImpl(`${baseUrl}${path}`, requestOptions);

    if (!response.ok) {
      const responseBody = await readErrorResponseBody({
        response,
        parseAs
      });
      const error = new Error(
        `Internal API request failed with status ${response.status}: ${buildErrorSummary(responseBody)}`
      );

      error.status = response.status;
      error.responseBody = responseBody;
      logger.error(`内部接口请求失败：${normalizedMethod} ${path} status=${response.status}`);
      throw error;
    }

    return parseResponseBody({
      response,
      parseAs
    });
  }

  return {
    request
  };
}

module.exports = {
  createInternalApiService
};
