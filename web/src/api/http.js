/**
 * 概述：封装管理员前端最小 HTTP 客户端，统一注入 JSON 请求头、管理员 token 与响应解析逻辑。
 */
const ADMIN_TOKEN_KEY = 'tl-telegram-bot-admin-token';

/**
 * 读取本地管理员 token。
 * @returns {string} 当前保存的 token；未登录时返回空字符串。
 */
export function getAdminToken() {
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

/**
 * 保存管理员 token。
 * @param {string} token - 登录后返回的管理员 token。
 */
export function setAdminToken(token) {
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

/**
 * 移除管理员 token。
 */
export function clearAdminToken() {
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

/**
 * 发起最小 JSON 请求。
 * 核心分支语义：存在 token 时自动附带 Bearer 鉴权头；响应非 2xx 时抛出异常，便于页面统一处理提示。
 * @param {{ method?: string, path: string, body?: unknown }} options - 请求参数。
 * @returns {Promise<any>} 服务端解析后的 JSON 响应。
 */
async function request(options) {
  const method = options.method || 'GET';
  const token = getAdminToken();
  const headers = {
    Accept: 'application/json'
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(options.path, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload && payload.message ? payload.message : `Request failed: ${response.status}`);
  }

  return payload;
}

/**
 * 概述：导出最小 REST 调用集合，供管理员 API 封装复用。
 */
export const http = {
  get(path) {
    return request({ method: 'GET', path });
  },
  post(path, body) {
    return request({ method: 'POST', path, body });
  },
  put(path, body) {
    return request({ method: 'PUT', path, body });
  }
};
