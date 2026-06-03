import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import CertificatesView from '../views/CertificatesView.vue';
import ConfigView from '../views/ConfigView.vue';
import LoginView from '../views/LoginView.vue';
import WebhookView from '../views/WebhookView.vue';
import { getAdminToken } from '../api/http.js';
import { getAdminBasePath } from '../utils/admin-base-path.js';

/**
 * 概述：定义管理员前端基础路由，
 * 在隐藏路径模式下使用动态 history base，确保页面导航始终停留在秘密入口之下。
 */
const routes = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { title: '管理员登录', public: true }
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: DashboardView,
    meta: { title: '运行概览' }
  },
  { path: '/config', name: 'config', component: ConfigView, meta: { title: '基础配置' } },
  {
    path: '/certificates',
    name: 'certificates',
    component: CertificatesView,
    meta: { title: '证书管理' }
  },
  { path: '/webhook', name: 'webhook', component: WebhookView, meta: { title: 'Webhook 管理' } }
];

const router = createRouter({
  history: createWebHistory(getAdminBasePath()),
  routes
});

router.beforeEach((to) => {
  const token = getAdminToken();
  const isPublicRoute = Boolean(to.meta && to.meta.public);

  if (!token && !isPublicRoute) {
    return {
      path: '/login'
    };
  }

  if (token && to.path === '/login') {
    return {
      path: '/dashboard'
    };
  }

  return true;
});

export default router;
