import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import CertificatesView from '../views/CertificatesView.vue';
import ConfigView from '../views/ConfigView.vue';
import LoginView from '../views/LoginView.vue';
import WebhookView from '../views/WebhookView.vue';
import { getAdminToken } from '../api/http.js';

/**
 * 概述：定义管理员前端基础路由，按页面职责拆分登录、概览、配置、证书和 Webhook 管理入口。
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

/**
 * 概述：创建 Vue Router 实例，当前使用 history 模式，供后续管理员路由守卫扩展。
 */
const router = createRouter({
  history: createWebHistory(),
  routes
});

/**
 * 概述：管理员路由守卫，未登录时统一跳转到登录页；已登录访问登录页时回退到概览页。
 */
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
