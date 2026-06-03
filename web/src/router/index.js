import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import CertificatesView from '../views/CertificatesView.vue';
import ConfigView from '../views/ConfigView.vue';
import LoginView from '../views/LoginView.vue';
import WebhookView from '../views/WebhookView.vue';

/**
 * 概述：定义管理员前端基础路由，按页面职责拆分登录、概览、配置、证书和 Webhook 管理入口。
 */
const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', name: 'login', component: LoginView, meta: { title: '管理员登录' } },
  { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { title: '运行概览' } },
  { path: '/config', name: 'config', component: ConfigView, meta: { title: '基础配置' } },
  {
    path: '/certificates',
    name: 'certificates',
    component: CertificatesView,
    meta: { title: '证书管理' }
  },
  { path: '/webhook', name: 'webhook', component: WebhookView, meta: { title: 'Webhook 管理' } }
];

/**
 * 概述：创建 Vue Router 实例，当前使用 history 模式，供后续管理员路由守卫扩展。
 */
const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
