/**
 * 概述：提供 PM2 启动配置，统一定义 Telegram Bot 服务的入口、工作目录和环境变量。
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
      max_memory_restart: '256M',
      watch: false,
      // PM2 接管标准输出与错误输出，分别写入固定日志文件。
      out_file: './logs/app.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        APP_HOST: '0.0.0.0',
        APP_PORT: 443,
        ADMIN_ACCESS_PATH: '',
        DB_PATH: './server/data/app.db',
        TLS_FULLCHAIN_PATH: '',
        TLS_PRIVKEY_PATH: '',
        WEBHOOK_BASE_URL: '',
        WEBHOOK_PATH: '/telegram/webhook',
        TELEGRAM_BOT_TOKEN: '',
        INTERNAL_API_BASE_URL: '',
        INTERNAL_API_SECRET: '',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'admin123456',
        ADMIN_LOGIN_COOLDOWN_SECONDS: 1800,
        ADMIN_TOKEN_TTL_SECONDS: 3600,
        ALERT_POLL_INTERVAL_SECONDS: 60,
        ACME_BASE_PATH: '/root/.acme.sh',
        TLS_TARGET_BASE_PATH: '/root/tlboot'
      }
    }
  ]
};
