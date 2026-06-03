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
 * 获取当前管理员登录凭据概要。
 * @returns {Promise<any>} 当前管理员用户名响应。
 */
export function fetchAdminCredentials() {
  return http.get('/api/admin/auth/credentials');
}

/**
 * 更新当前管理员登录凭据。
 * @param {{ username: string, currentPassword: string, newPassword: string }} payload - 凭据修改载荷。
 * @returns {Promise<any>} 凭据更新响应。
 */
export function updateAdminCredentials(payload) {
  return http.put('/api/admin/auth/credentials', payload);
}

/**
 * 获取管理员配置骨架。
 * @returns {Promise<any>} 配置接口响应。
 */
export function fetchConfig() {
  return http.get('/api/admin/config');
}

/**
 * 保存管理员配置。
 * @param {Record<string, string>} payload - 配置表单载荷。
 * @returns {Promise<any>} 配置保存响应。
 */
export function saveConfig(payload) {
  return http.put('/api/admin/config', payload);
}

/**
 * 获取证书状态骨架。
 * @returns {Promise<any>} 证书状态响应。
 */
export function fetchCertificateStatus() {
  return http.get('/api/admin/certificates/status');
}

/**
 * 获取可用证书域名列表。
 * @returns {Promise<any>} 域名列表响应。
 */
export function fetchCertificateDomains() {
  return http.get('/api/admin/certificates/domains');
}

/**
 * 选择并激活证书域名。
 * @param {{ domain: string }} payload - 待激活域名。
 * @returns {Promise<any>} 证书选择响应。
 */
export function selectCertificateDomain(payload) {
  return http.post('/api/admin/certificates/select', payload);
}

/**
 * 获取系统状态骨架。
 * @returns {Promise<any>} 状态接口响应。
 */
export function fetchStatus() {
  return http.get('/api/admin/status');
}

/**
 * 获取管理员概览状态。
 * @returns {Promise<any>} 概览接口响应。
 */
export function fetchOverview() {
  return http.get('/api/admin/status/overview');
}

/**
 * 注册 Telegram Webhook。
 * @returns {Promise<any>} Webhook 注册响应。
 */
export function registerWebhook() {
  return http.post('/api/admin/webhook/register', {});
}
