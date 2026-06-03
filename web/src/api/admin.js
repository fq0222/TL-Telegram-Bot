import { http } from './http.js';

/**
 * 概述：封装管理员前端当前阶段可见的最小接口，
 * 统一由页面层调用，避免视图直接拼接隐藏 API 路径。
 */

export function loginAdmin(payload) {
  return http.post('/auth/login', payload);
}

export function fetchAdminCredentials() {
  return http.get('/auth/credentials');
}

export function updateAdminCredentials(payload) {
  return http.put('/auth/credentials', payload);
}

export function fetchConfig() {
  return http.get('/config');
}

export function saveConfig(payload) {
  return http.put('/config', payload);
}

export function fetchCertificateStatus() {
  return http.get('/certificates/status');
}

export function fetchCertificateDomains() {
  return http.get('/certificates/domains');
}

export function selectCertificateDomain(payload) {
  return http.post('/certificates/select', payload);
}

export function fetchStatus() {
  return http.get('/status');
}

export function fetchOverview() {
  return http.get('/status/overview');
}

export function registerWebhook() {
  return http.post('/webhook/register', {});
}
