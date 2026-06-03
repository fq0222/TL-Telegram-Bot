/**
 * 概述：提供 PM2 启动配置，统一定义 Telegram Bot 服务的入口、工作目录和基础环境变量。
 */
module.exports = {
  apps: [
    {
      name: 'tl-telegram-bot',
      script: './server/src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        APP_HOST: '0.0.0.0',
        APP_PORT: 443
      }
    }
  ]
};
