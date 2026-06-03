import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 概述：提供管理员前端的 Vite 构建配置，统一定义开发端口与构建输出目录，便于后端后续托管静态资源。
 */
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
