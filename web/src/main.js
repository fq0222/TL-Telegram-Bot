import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import './styles/global.css';

/**
 * 概述：创建管理员前端入口应用，挂载全局路由与基础样式。
 */
createApp(App).use(router).mount('#app');
