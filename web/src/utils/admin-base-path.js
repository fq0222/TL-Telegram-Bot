/**
 * 概述：统一解析管理员前端隐藏访问路径，
 * 让路由、HTTP 客户端与登录跳转在秘密前缀模式下保持一致。
 */

/**
 * 根据当前浏览器路径解析管理员基路径。
 * @returns {string} 管理员前端基路径；未命中隐藏模式时返回空字符串。
 */
export function getAdminBasePath() {
  const pathname =
    typeof window !== 'undefined' && window.location && typeof window.location.pathname === 'string'
      ? window.location.pathname
      : '';
  const match = pathname.match(/^\/([a-zA-Z0-9]{32})(?:\/|$)/);

  return match ? `/${match[1]}` : '';
}

/**
 * 拼接管理员 API 的根路径。
 * @returns {string} 管理员 API 根路径。
 */
export function getAdminApiBasePath() {
  return `${getAdminBasePath()}/api/admin`;
}

/**
 * 拼接管理员前端内部路径。
 * @param {string} path - 相对管理员根路径的页面路径。
 * @returns {string} 带基路径的前端访问地址。
 */
export function toAdminAppPath(path) {
  const normalizedPath = typeof path === 'string' && path.startsWith('/') ? path : `/${path || ''}`;

  return `${getAdminBasePath()}${normalizedPath}`;
}
