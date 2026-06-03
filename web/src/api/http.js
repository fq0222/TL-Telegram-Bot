/**
 * 概述：封装管理员前端 HTTP 客户端，
 * 统一注入隐藏管理端 API 前缀、JSON 请求头、管理员 token 与错误响应处理逻辑。
 */
import { getAdminApiBasePath, toAdminAppPath } from '../utils/admin-base-path.js';

const ADMIN_TOKEN_KEY = 'tl-telegram-bot-admin-token';

/**
 * 读取本地管理员 token。
 * @returns {string} 当前保存的 token。
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
 * 处理管理员会话失效。
 */
function handleUnauthorized() {
  clearAdminToken();

  if (window.location.pathname !== toAdminAppPath('/login')) {
    window.location.href = toAdminAppPath('/login');
  }
}

/**
 * 规范化管理员 API 路径。
 * @param {string} path - 相对管理员 API 根路径的请求路径。
 * @returns {string} 完整请求路径。
 */
function resolveApiPath(path) {
  const normalizedPath = typeof path === 'string' && path.startsWith('/') ? path : `/${path || ''}`;

  return `${getAdminApiBasePath()}${normalizedPath}`;
}

/**
 * 发起最小 JSON 请求。
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

  const response = await fetch(resolveApiPath(options.path), {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }

    const error = new Error(payload && payload.message ? payload.message : `Request failed: ${response.status}`);

    error.details = payload && payload.data ? payload.data : null;
    error.statusCode = response.status;
    throw error;
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
