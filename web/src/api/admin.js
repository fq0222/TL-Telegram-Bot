import { http } from './http.js';

/**
 * 概述：封装管理员前端当前阶段可见的最小接口，统一由页面层调用，避免路由视图直接拼接请求路径。
 */

/**
 * 请求管理员登录。
 * @param {{ username: string, password: string }} payload - 登录表单载荷。
 * @returns {Promise<any>} 登录响应。
 */
export function loginAdmin(payload) {
  return http.post('/api/admin/auth/login', payload);
}

/**
 * 获取管理员配置骨架。
 * @returns {Promise<any>} 配置接口响应。
 */
export function fetchConfig() {
  return http.get('/api/admin/config');
}

/**
 * 获取证书状态骨架。
 * @returns {Promise<any>} 证书状态响应。
 */
export function fetchCertificateStatus() {
  return http.get('/api/admin/certificates/status');
}

/**
 * 获取系统状态骨架。
 * @returns {Promise<any>} 状态接口响应。
 */
export function fetchStatus() {
  return http.get('/api/admin/status');
}
