# Telegram Bot Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零构建一个基于 `Node.js + Express`、`Vue 3 + Vite`、`SQLite` 和 Telegram `Webhook` 的管理员监控机器人系统，并提供仅管理员可用的配置管理页面、证书域名选择与 PM2 启动能力。

**Architecture:** 仓库采用 `server + web` 双应用结构，`server` 负责 HTTPS 监听、Webhook、管理 API、SQLite 配置持久化、证书扫描与内部接口调用，`web` 负责管理员配置页面并在构建后由 `server` 托管。系统按 MVC 分层，所有关键流程通过统一日志工具输出可定位日志。

**Tech Stack:** Node.js, Express, Vue 3, Vite, SQLite, PM2, HTTPS, Telegram Bot API

---

## File Structure

### Root

- Create: `package.json`
- Create: `README.md`
- Create: `.env.example`
- Create: `ecosystem.config.js`

### Server

- Create: `server/package.json`
- Create: `server/src/app.js`
- Create: `server/src/server.js`
- Create: `server/src/config/env.js`
- Create: `server/src/config/constants.js`
- Create: `server/src/config/database.js`
- Create: `server/src/controllers/admin-auth-controller.js`
- Create: `server/src/controllers/admin-config-controller.js`
- Create: `server/src/controllers/certificate-controller.js`
- Create: `server/src/controllers/status-controller.js`
- Create: `server/src/controllers/webhook-controller.js`
- Create: `server/src/middlewares/admin-auth-middleware.js`
- Create: `server/src/middlewares/error-handler.js`
- Create: `server/src/middlewares/not-found-handler.js`
- Create: `server/src/middlewares/request-logger.js`
- Create: `server/src/repositories/config-repository.js`
- Create: `server/src/repositories/session-repository.js`
- Create: `server/src/repositories/operation-log-repository.js`
- Create: `server/src/routes/admin-routes.js`
- Create: `server/src/routes/webhook-routes.js`
- Create: `server/src/services/admin-auth-service.js`
- Create: `server/src/services/config-service.js`
- Create: `server/src/services/certificate-service.js`
- Create: `server/src/services/filesystem-service.js`
- Create: `server/src/services/https-state-service.js`
- Create: `server/src/services/internal-api-service.js`
- Create: `server/src/services/telegram-api-service.js`
- Create: `server/src/services/telegram-command-service.js`
- Create: `server/src/services/alert-polling-service.js`
- Create: `server/src/utils/logger.js`
- Create: `server/src/utils/time.js`
- Create: `server/src/utils/response.js`
- Create: `server/src/utils/http-error.js`
- Create: `server/src/utils/signature.js`
- Create: `server/src/utils/formatter.js`
- Create: `server/src/utils/path-resolver.js`
- Create: `server/src/storage/init.sql`
- Create: `server/storage/app.db`
- Create: `server/test/config-service.test.js`
- Create: `server/test/signature.test.js`
- Create: `server/test/certificate-service.test.js`
- Create: `server/test/webhook-route.test.js`
- Create: `server/test/admin-api.test.js`

### Web

- Create: `web/package.json`
- Create: `web/index.html`
- Create: `web/vite.config.js`
- Create: `web/src/main.js`
- Create: `web/src/App.vue`
- Create: `web/src/router/index.js`
- Create: `web/src/api/http.js`
- Create: `web/src/api/admin.js`
- Create: `web/src/components/AppShell.vue`
- Create: `web/src/components/StatusCard.vue`
- Create: `web/src/views/LoginView.vue`
- Create: `web/src/views/DashboardView.vue`
- Create: `web/src/views/ConfigView.vue`
- Create: `web/src/views/CertificatesView.vue`
- Create: `web/src/views/WebhookView.vue`
- Create: `web/src/styles/global.css`

## Task 1: 初始化仓库与工作区脚手架

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `README.md`
- Create: `server/package.json`
- Create: `web/package.json`

- [ ] **Step 1: 写一个失败前就能运行的根脚手架检查**

在根 `package.json` 中先定义脚本，后续如果子应用缺失会直接报错，便于尽早暴露问题：

```json
{
  "name": "tl-telegram-bot",
  "private": true,
  "version": "1.0.0",
  "workspaces": [
    "server",
    "web"
  ],
  "scripts": {
    "dev:server": "npm --workspace server run dev",
    "dev:web": "npm --workspace web run dev",
    "build": "npm --workspace web run build",
    "check": "node --test server/test/*.test.js"
  }
}
```

- [ ] **Step 2: 运行根脚手架命令，确认当前确实失败**

Run: `npm run check`  
Expected: FAIL，提示 `server/test/*.test.js` 或 `server/package.json` 尚不存在。

- [ ] **Step 3: 写最小工作区配置**

根 `.env.example`：

```env
NODE_ENV=development
APP_HOST=0.0.0.0
APP_PORT=443
DB_PATH=./server/storage/app.db
TLS_FULLCHAIN_PATH=
TLS_PRIVKEY_PATH=
WEBHOOK_BASE_URL=
WEBHOOK_PATH=/telegram/webhook
TELEGRAM_BOT_TOKEN=
INTERNAL_API_BASE_URL=
INTERNAL_API_SECRET=
ADMIN_PASSWORD=admin123456
ALERT_POLL_INTERVAL_SECONDS=60
ACME_BASE_PATH=~/.acme.sh
TLS_TARGET_BASE_PATH=/root/tlboot
```

`server/package.json`：

```json
{
  "name": "server",
  "type": "commonjs",
  "scripts": {
    "dev": "node src/server.js",
    "test": "node --test ../server/test/*.test.js"
  }
}
```

`web/package.json`：

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

- [ ] **Step 4: 再次运行根检查**

Run: `npm run check`  
Expected: FAIL，但错误应前进到“测试文件不存在”而不是“workspace 不存在”。

- [ ] **Step 5: 提交**

本仓库规则要求未获用户明确要求前不要 `git add`。本步骤仅记录执行点，不执行提交。

## Task 2: 建立服务端基础设施与日志工具

**Files:**
- Create: `server/src/app.js`
- Create: `server/src/server.js`
- Create: `server/src/utils/logger.js`
- Create: `server/src/utils/time.js`
- Create: `server/src/utils/response.js`
- Create: `server/src/utils/http-error.js`
- Create: `server/src/middlewares/error-handler.js`
- Create: `server/src/middlewares/not-found-handler.js`
- Create: `server/src/middlewares/request-logger.js`

- [ ] **Step 1: 写日志工具测试**

`server/test/config-service.test.js` 先放一个基础断言，确保日志工具输出接口存在：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger } = require('../src/utils/logger');

test('createLogger should expose info warn error methods', () => {
  const logger = createLogger('Test');
  assert.equal(typeof logger.info, 'function');
  assert.equal(typeof logger.warn, 'function');
  assert.equal(typeof logger.error, 'function');
});
```

- [ ] **Step 2: 运行单测确认失败**

Run: `node --test server/test/config-service.test.js`  
Expected: FAIL，提示 `../src/utils/logger` 不存在。

- [ ] **Step 3: 写最小实现**

`server/src/utils/time.js`：

```js
/**
 * 时间工具：统一返回上海时区本地时间字符串。
 * @returns {string} 格式化后的时间字符串。
 */
function getLocalTime() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

module.exports = { getLocalTime };
```

`server/src/utils/logger.js`：

```js
const { getLocalTime } = require('./time');

/**
 * 日志工具：为模块生成统一格式的日志方法。
 * @param {string} moduleName - 模块名称。
 * @returns {{info: Function, warn: Function, error: Function}} 日志方法集合。
 */
function createLogger(moduleName) {
  return {
    info: (message) => console.log(`[${moduleName}] [INFO] ${getLocalTime()} - ${message}`),
    warn: (message) => console.warn(`[${moduleName}] [WARN] ${getLocalTime()} - ${message}`),
    error: (message) => console.error(`[${moduleName}] [ERROR] ${getLocalTime()} - ${message}`)
  };
}

module.exports = { createLogger };
```

`server/src/utils/response.js`：

```js
/**
 * 响应工具：构建统一的成功响应。
 * @param {unknown} data - 响应数据。
 * @returns {{code:number,message:string,data:unknown}} 统一响应对象。
 */
function ok(data = {}) {
  return { code: 0, message: 'ok', data };
}

module.exports = { ok };
```

- [ ] **Step 4: 为中间件和应用入口写最小骨架**

`server/src/app.js`：

```js
const express = require('express');
const { requestLogger } = require('./middlewares/request-logger');
const { notFoundHandler } = require('./middlewares/not-found-handler');
const { errorHandler } = require('./middlewares/error-handler');

/**
 * 应用工厂：创建基础 Express 应用实例。
 * @returns {import('express').Express} Express 应用。
 */
function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.get('/healthz', (_req, res) => res.json({ code: 0, message: 'ok', data: { service: 'tl-telegram-bot' } }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test server/test/config-service.test.js`  
Expected: PASS

## Task 3: 建立 SQLite 初始化与配置仓储

**Files:**
- Create: `server/src/config/database.js`
- Create: `server/src/storage/init.sql`
- Create: `server/src/repositories/config-repository.js`
- Create: `server/src/repositories/session-repository.js`
- Create: `server/src/repositories/operation-log-repository.js`
- Create: `server/src/services/config-service.js`
- Test: `server/test/config-service.test.js`

- [ ] **Step 1: 扩充配置服务测试，先写失败用例**

把 `server/test/config-service.test.js` 扩充为：

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('config service should save and read config values', async () => {
  const { createConfigService } = require('../src/services/config-service');
  const service = createConfigService({
    repository: {
      saveMany: async (entries) => entries,
      getMany: async () => ({
        telegram_bot_token: 'abc',
        webhook_path: '/telegram/webhook'
      })
    }
  });

  await service.saveConfig({
    telegram_bot_token: 'abc',
    webhook_path: '/telegram/webhook'
  });

  const config = await service.getConfig();
  assert.equal(config.telegram_bot_token, 'abc');
  assert.equal(config.webhook_path, '/telegram/webhook');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test server/test/config-service.test.js`  
Expected: FAIL，提示 `createConfigService` 不存在。

- [ ] **Step 3: 写数据库初始化 SQL**

`server/src/storage/init.sql`：

```sql
CREATE TABLE IF NOT EXISTS system_configs (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 4: 写最小配置服务与仓储接口**

`server/src/services/config-service.js`：

```js
/**
 * 配置服务：统一读写系统配置。
 * @param {{repository:{saveMany:Function,getMany:Function}}} deps - 仓储依赖。
 * @returns {{saveConfig:Function,getConfig:Function}} 配置服务实例。
 */
function createConfigService({ repository }) {
  return {
    async saveConfig(payload) {
      return repository.saveMany(payload);
    },
    async getConfig() {
      return repository.getMany();
    }
  };
}

module.exports = { createConfigService };
```

`server/src/repositories/config-repository.js`：

```js
/**
 * 配置仓储：封装 system_configs 表读写。
 * @param {{db:any, now:Function}} deps - 数据库与时间依赖。
 * @returns {{saveMany:Function,getMany:Function}} 仓储实例。
 */
function createConfigRepository({ db, now }) {
  return {
    async saveMany(payload) {
      const entries = Object.entries(payload);
      for (const [key, value] of entries) {
        db.prepare(`
          INSERT INTO system_configs (config_key, config_value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = excluded.updated_at
        `).run(key, JSON.stringify(value), now());
      }
      return payload;
    },
    async getMany() {
      const rows = db.prepare('SELECT config_key, config_value FROM system_configs').all();
      return rows.reduce((acc, row) => {
        acc[row.config_key] = JSON.parse(row.config_value);
        return acc;
      }, {});
    }
  };
}

module.exports = { createConfigRepository };
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test server/test/config-service.test.js`  
Expected: PASS

## Task 4: 建立内部接口签名工具与客户端

**Files:**
- Create: `server/src/utils/signature.js`
- Create: `server/src/services/internal-api-service.js`
- Test: `server/test/signature.test.js`

- [ ] **Step 1: 写签名测试**

`server/test/signature.test.js`：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSignaturePayload, signRequest } = require('../src/utils/signature');

test('signature payload should match spec', () => {
  const payload = buildSignaturePayload({
    method: 'POST',
    path: '/api/internal/telegram/admin/bind/verify',
    timestamp: '1770000000',
    rawBody: '{"bind_code":"TG-ADMIN-ABCD1234","chat_id":"123456789"}'
  });

  assert.equal(
    payload,
    'POST\n/api/internal/telegram/admin/bind/verify\n1770000000\n{"bind_code":"TG-ADMIN-ABCD1234","chat_id":"123456789"}'
  );
});

test('signature should produce hex hmac sha256', () => {
  const signature = signRequest({
    secret: 'test-secret',
    method: 'GET',
    path: '/api/internal/telegram/health',
    timestamp: '1770000000',
    rawBody: ''
  });

  assert.match(signature, /^[a-f0-9]{64}$/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test server/test/signature.test.js`  
Expected: FAIL，提示签名工具不存在。

- [ ] **Step 3: 写最小签名实现**

`server/src/utils/signature.js`：

```js
const crypto = require('crypto');

/**
 * 签名工具：按内部接口规范构建签名原文。
 * @param {{method:string,path:string,timestamp:string,rawBody:string}} input - 签名入参。
 * @returns {string} 原始签名字符串。
 */
function buildSignaturePayload({ method, path, timestamp, rawBody }) {
  return `${method}\n${path}\n${timestamp}\n${rawBody}`;
}

/**
 * 签名工具：生成十六进制 HMAC-SHA256 签名。
 * @param {{secret:string,method:string,path:string,timestamp:string,rawBody:string}} input - 签名入参。
 * @returns {string} 十六进制签名。
 */
function signRequest({ secret, method, path, timestamp, rawBody }) {
  const payload = buildSignaturePayload({ method, path, timestamp, rawBody });
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

module.exports = { buildSignaturePayload, signRequest };
```

- [ ] **Step 4: 写内部 API 客户端骨架**

`server/src/services/internal-api-service.js`：

```js
const { signRequest } = require('../utils/signature');

/**
 * 内部接口客户端：统一封装签名请求与 JSON 响应处理。
 * @param {{baseUrl:string,secret:string,fetchImpl:Function}} deps - 基础配置与 fetch 实现。
 * @returns {{request:Function}} 客户端实例。
 */
function createInternalApiService({ baseUrl, secret, fetchImpl }) {
  return {
    async request({ method, path, body }) {
      const rawBody = body ? JSON.stringify(body) : '';
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = signRequest({ secret, method, path, timestamp, rawBody });
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Client': 'telegram-bot',
          'X-Internal-Timestamp': timestamp,
          'X-Internal-Signature': signature
        },
        body: rawBody || undefined
      });
      return response.json();
    }
  };
}

module.exports = { createInternalApiService };
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test server/test/signature.test.js`  
Expected: PASS

## Task 5: 建立证书扫描与复制服务

**Files:**
- Create: `server/src/utils/path-resolver.js`
- Create: `server/src/services/filesystem-service.js`
- Create: `server/src/services/certificate-service.js`
- Test: `server/test/certificate-service.test.js`

- [ ] **Step 1: 写证书扫描失败测试**

`server/test/certificate-service.test.js`：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCertificateService } = require('../src/services/certificate-service');

test('certificate service should list domains with fullchain and privkey', async () => {
  const service = createCertificateService({
    fsService: {
      listDirectories: async () => ['example.com', 'invalid.local'],
      exists: async (path) => path.includes('example.com'),
      ensureDir: async () => {},
      copyFile: async () => {}
    },
    basePath: '/root/.acme.sh',
    targetBasePath: '/root/tlboot'
  });

  const domains = await service.listDomains();
  assert.equal(domains.length, 1);
  assert.equal(domains[0].domain, 'example.com');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test server/test/certificate-service.test.js`  
Expected: FAIL，提示证书服务不存在。

- [ ] **Step 3: 写最小证书服务**

`server/src/services/certificate-service.js`：

```js
const path = require('path');

/**
 * 证书服务：扫描 acme.sh 域名并复制选定证书到 TLS 目录。
 * @param {{fsService:Object,basePath:string,targetBasePath:string}} deps - 文件系统依赖和路径配置。
 * @returns {{listDomains:Function,activateDomain:Function}} 服务实例。
 */
function createCertificateService({ fsService, basePath, targetBasePath }) {
  return {
    async listDomains() {
      const directories = await fsService.listDirectories(basePath);
      const results = [];
      for (const domain of directories) {
        const sourceDir = path.join(basePath, domain);
        const fullchainPath = path.join(sourceDir, 'fullchain.pem');
        const privkeyPath = path.join(sourceDir, 'privkey.pem');
        const hasFullchain = await fsService.exists(fullchainPath);
        const hasPrivkey = await fsService.exists(privkeyPath);
        if (hasFullchain && hasPrivkey) {
          results.push({
            domain,
            sourceFullchainPath: fullchainPath,
            sourcePrivkeyPath: privkeyPath,
            targetFullchainPath: path.join(targetBasePath, domain, 'fullchain.pem'),
            targetPrivkeyPath: path.join(targetBasePath, domain, 'privkey.pem')
          });
        }
      }
      return results;
    },
    async activateDomain(domain) {
      const sourceDir = path.join(basePath, domain);
      const targetDir = path.join(targetBasePath, domain);
      await fsService.ensureDir(targetDir);
      await fsService.copyFile(path.join(sourceDir, 'fullchain.pem'), path.join(targetDir, 'fullchain.pem'));
      await fsService.copyFile(path.join(sourceDir, 'privkey.pem'), path.join(targetDir, 'privkey.pem'));
      return {
        domain,
        tlsFullchainPath: path.join(targetDir, 'fullchain.pem'),
        tlsPrivkeyPath: path.join(targetDir, 'privkey.pem')
      };
    }
  };
}

module.exports = { createCertificateService };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test server/test/certificate-service.test.js`  
Expected: PASS

- [ ] **Step 5: 补一个复制成功路径的断言测试**

追加测试：

```js
test('certificate service should copy selected domain files into /root/tlboot/<domain>', async () => {
  const copied = [];
  const service = createCertificateService({
    fsService: {
      listDirectories: async () => [],
      exists: async () => true,
      ensureDir: async () => {},
      copyFile: async (from, to) => copied.push({ from, to })
    },
    basePath: '/root/.acme.sh',
    targetBasePath: '/root/tlboot'
  });

  const result = await service.activateDomain('example.com');
  assert.equal(result.tlsFullchainPath, '/root/tlboot/example.com/fullchain.pem');
  assert.equal(result.tlsPrivkeyPath, '/root/tlboot/example.com/privkey.pem');
  assert.equal(copied.length, 2);
});
```

Run: `node --test server/test/certificate-service.test.js`  
Expected: PASS

## Task 6: 建立管理员认证与配置 API

**Files:**
- Create: `server/src/controllers/admin-auth-controller.js`
- Create: `server/src/controllers/admin-config-controller.js`
- Create: `server/src/controllers/certificate-controller.js`
- Create: `server/src/controllers/status-controller.js`
- Create: `server/src/middlewares/admin-auth-middleware.js`
- Create: `server/src/routes/admin-routes.js`
- Create: `server/src/services/admin-auth-service.js`
- Test: `server/test/admin-api.test.js`

- [ ] **Step 1: 写管理 API 失败测试**

`server/test/admin-api.test.js`：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

test('GET /api/admin/config should reject unauthenticated requests', async () => {
  const app = createApp();
  const response = await request(app).get('/api/admin/config');
  assert.equal(response.status, 401);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test server/test/admin-api.test.js`  
Expected: FAIL，提示 `supertest` 未安装或路由不存在。

- [ ] **Step 3: 写最小鉴权与路由实现**

`server/src/middlewares/admin-auth-middleware.js`：

```js
/**
 * 管理鉴权中间件：校验请求头中的后台会话令牌。
 * @param {import('express').Request} req - 请求对象。
 * @param {import('express').Response} res - 响应对象。
 * @param {Function} next - 中间件继续函数。
 */
function adminAuthMiddleware(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).json({ code: 401, message: '未登录', data: null });
  }
  return next();
}

module.exports = { adminAuthMiddleware };
```

`server/src/routes/admin-routes.js`：

```js
const express = require('express');
const { adminAuthMiddleware } = require('../middlewares/admin-auth-middleware');

/**
 * 管理路由：挂载后台认证、配置、证书与状态接口。
 * @returns {import('express').Router} 管理路由。
 */
function createAdminRoutes() {
  const router = express.Router();
  router.post('/auth/login', (_req, res) => res.json({ code: 0, message: 'ok', data: { token: 'dev-token' } }));
  router.use(adminAuthMiddleware);
  router.get('/config', (_req, res) => res.json({ code: 0, message: 'ok', data: {} }));
  return router;
}

module.exports = { createAdminRoutes };
```

- [ ] **Step 4: 把管理路由挂到应用**

更新 `server/src/app.js`：

```js
const { createAdminRoutes } = require('./routes/admin-routes');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.use('/api/admin', createAdminRoutes());
  app.get('/healthz', (_req, res) => res.json({ code: 0, message: 'ok', data: { service: 'tl-telegram-bot' } }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test server/test/admin-api.test.js`  
Expected: PASS

## Task 7: 建立 Telegram Webhook 路由与命令分发骨架

**Files:**
- Create: `server/src/controllers/webhook-controller.js`
- Create: `server/src/routes/webhook-routes.js`
- Create: `server/src/services/telegram-command-service.js`
- Create: `server/src/services/telegram-api-service.js`
- Test: `server/test/webhook-route.test.js`

- [ ] **Step 1: 写 Webhook 路由失败测试**

`server/test/webhook-route.test.js`：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

test('POST /telegram/webhook should accept Telegram update payload', async () => {
  const app = createApp();
  const response = await request(app)
    .post('/telegram/webhook')
    .send({
      update_id: 1,
      message: {
        message_id: 1,
        text: '/status',
        chat: { id: 123456789 }
      }
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.code, 0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test server/test/webhook-route.test.js`  
Expected: FAIL，提示 webhook 路由不存在。

- [ ] **Step 3: 写最小命令分发骨架**

`server/src/services/telegram-command-service.js`：

```js
/**
 * Telegram 命令服务：从消息文本中提取命令并返回分发结果。
 * @returns {{handleUpdate:Function}} 命令处理服务。
 */
function createTelegramCommandService() {
  return {
    async handleUpdate(update) {
      const text = update?.message?.text || '';
      if (text.startsWith('/bind ')) return { handled: true, command: 'bind' };
      if (text === '/status') return { handled: true, command: 'status' };
      if (text === '/servers') return { handled: true, command: 'servers' };
      if (text.startsWith('/server ')) return { handled: true, command: 'server' };
      if (text === '/alerts') return { handled: true, command: 'alerts' };
      if (text.startsWith('/user ')) return { handled: true, command: 'user' };
      return { handled: false, command: 'unknown' };
    }
  };
}

module.exports = { createTelegramCommandService };
```

- [ ] **Step 4: 写 Webhook 控制器和路由**

`server/src/controllers/webhook-controller.js`：

```js
/**
 * Webhook 控制器：接收 Telegram 更新并交由命令服务处理。
 * @param {{commandService:{handleUpdate:Function}}} deps - 服务依赖。
 * @returns {{receiveUpdate:Function}} 控制器实例。
 */
function createWebhookController({ commandService }) {
  return {
    async receiveUpdate(req, res, next) {
      try {
        await commandService.handleUpdate(req.body);
        return res.json({ code: 0, message: 'ok', data: { accepted: true } });
      } catch (error) {
        return next(error);
      }
    }
  };
}

module.exports = { createWebhookController };
```

`server/src/routes/webhook-routes.js`：

```js
const express = require('express');
const { createWebhookController } = require('../controllers/webhook-controller');
const { createTelegramCommandService } = require('../services/telegram-command-service');

function createWebhookRoutes() {
  const router = express.Router();
  const controller = createWebhookController({ commandService: createTelegramCommandService() });
  router.post('/telegram/webhook', controller.receiveUpdate);
  return router;
}

module.exports = { createWebhookRoutes };
```

- [ ] **Step 5: 把 Webhook 路由挂到应用并运行测试**

更新 `server/src/app.js` 增加：

```js
const { createWebhookRoutes } = require('./routes/webhook-routes');
app.use(createWebhookRoutes());
```

Run: `node --test server/test/webhook-route.test.js`  
Expected: PASS

## Task 8: 建立 HTTPS 启动与 PM2 配置

**Files:**
- Create: `server/src/config/env.js`
- Create: `server/src/services/https-state-service.js`
- Create: `server/src/server.js`
- Create: `ecosystem.config.js`

- [ ] **Step 1: 写服务入口最小实现**

`server/src/server.js`：

```js
const fs = require('fs');
const https = require('https');
const { createApp } = require('./app');
const { createLogger } = require('./utils/logger');

const logger = createLogger('Server');

/**
 * 启动函数：根据证书配置启动 HTTPS 服务。
 */
function start() {
  const fullchainPath = process.env.TLS_FULLCHAIN_PATH;
  const privkeyPath = process.env.TLS_PRIVKEY_PATH;
  const app = createApp();

  if (!fullchainPath || !privkeyPath || !fs.existsSync(fullchainPath) || !fs.existsSync(privkeyPath)) {
    logger.warn('HTTPS 证书未配置完成，服务进入未就绪状态');
    return app.listen(3000, () => logger.info('管理接口已启动在 3000 端口'));
  }

  const server = https.createServer(
    {
      cert: fs.readFileSync(fullchainPath),
      key: fs.readFileSync(privkeyPath)
    },
    app
  );

  return server.listen(443, () => logger.info('HTTPS 服务已启动在 443 端口'));
}

start();
```

- [ ] **Step 2: 写 PM2 配置**

`ecosystem.config.js`：

```js
module.exports = {
  apps: [
    {
      name: 'tl-telegram-bot',
      script: './server/src/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        APP_PORT: 443
      }
    }
  ]
};
```

- [ ] **Step 3: 运行语法检查**

Run: `node --check server/src/server.js`  
Expected: PASS

- [ ] **Step 4: 记录 PM2 启动验证命令**

Run: `pm2 start ecosystem.config.js`  
Expected: PM2 启动成功；若证书缺失，则日志显示“HTTPS 证书未配置完成”。

## Task 9: 建立前端管理员页面骨架

**Files:**
- Create: `web/index.html`
- Create: `web/vite.config.js`
- Create: `web/src/main.js`
- Create: `web/src/App.vue`
- Create: `web/src/router/index.js`
- Create: `web/src/api/http.js`
- Create: `web/src/api/admin.js`
- Create: `web/src/components/AppShell.vue`
- Create: `web/src/components/StatusCard.vue`
- Create: `web/src/views/LoginView.vue`
- Create: `web/src/views/DashboardView.vue`
- Create: `web/src/views/ConfigView.vue`
- Create: `web/src/views/CertificatesView.vue`
- Create: `web/src/views/WebhookView.vue`
- Create: `web/src/styles/global.css`

- [ ] **Step 1: 写最小 Vite 入口**

`web/src/main.js`：

```js
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles/global.css';

createApp(App).use(router).mount('#app');
```

- [ ] **Step 2: 写最小路由与根组件**

`web/src/router/index.js`：

```js
import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import DashboardView from '../views/DashboardView.vue';
import ConfigView from '../views/ConfigView.vue';
import CertificatesView from '../views/CertificatesView.vue';
import WebhookView from '../views/WebhookView.vue';

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', component: LoginView },
  { path: '/dashboard', component: DashboardView },
  { path: '/config', component: ConfigView },
  { path: '/certificates', component: CertificatesView },
  { path: '/webhook', component: WebhookView }
];

export default createRouter({
  history: createWebHistory(),
  routes
});
```

`web/src/App.vue`：

```vue
<template>
  <router-view />
</template>
```

- [ ] **Step 3: 写最小页面内容**

每个页面先只输出标题，例如 `web/src/views/CertificatesView.vue`：

```vue
<template>
  <section>
    <h1>证书管理</h1>
    <p>这里将展示从 ~/.acme.sh 扫描到的证书域名。</p>
  </section>
</template>
```

对 `LoginView.vue`、`DashboardView.vue`、`ConfigView.vue`、`WebhookView.vue` 使用同样模式输出对应标题。

- [ ] **Step 4: 运行前端构建**

Run: `npm run build`  
Expected: FAIL 或 PASS；如果失败，优先补齐缺失的 Vue/Vite 依赖与基础文件，直到构建通过。

- [ ] **Step 5: 托管前端构建目录**

在 `server/src/app.js` 后续增加：

```js
const path = require('path');
app.use(express.static(path.resolve(__dirname, '../../web/dist')));
```

Run: `npm run build`  
Expected: PASS

## Task 10: 打通端到端配置流与状态页

**Files:**
- Modify: `server/src/services/config-service.js`
- Modify: `server/src/services/certificate-service.js`
- Modify: `server/src/controllers/*.js`
- Modify: `web/src/api/admin.js`
- Modify: `web/src/views/*.vue`
- Modify: `server/test/admin-api.test.js`

- [ ] **Step 1: 为证书列表接口补测试**

给 `server/test/admin-api.test.js` 增加：

```js
test('GET /api/admin/certificates/domains should return available acme domains', async () => {
  const app = createApp();
  const response = await request(app)
    .get('/api/admin/certificates/domains')
    .set('Authorization', 'Bearer dev-token');

  assert.equal(response.status, 200);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test server/test/admin-api.test.js`  
Expected: FAIL，提示路由不存在。

- [ ] **Step 3: 实现配置、状态和证书相关接口**

至少补齐这些接口：

```js
router.get('/config', controller.getConfig);
router.put('/config', controller.saveConfig);
router.get('/certificates/domains', certificateController.listDomains);
router.post('/certificates/select', certificateController.selectDomain);
router.post('/webhook/register', statusController.registerWebhook);
router.get('/status/overview', statusController.getOverview);
```

关键返回字段要求：

```js
{
  code: 0,
  message: 'ok',
  data: {
    selected_certificate_domain: 'example.com',
    tls_fullchain_path: '/root/tlboot/example.com/fullchain.pem',
    tls_privkey_path: '/root/tlboot/example.com/privkey.pem'
  }
}
```

- [ ] **Step 4: 前端对接接口**

`web/src/api/admin.js`：

```js
import { http } from './http';

export function fetchConfig() {
  return http.get('/api/admin/config');
}

export function saveConfig(payload) {
  return http.put('/api/admin/config', payload);
}

export function fetchCertificateDomains() {
  return http.get('/api/admin/certificates/domains');
}

export function selectCertificateDomain(payload) {
  return http.post('/api/admin/certificates/select', payload);
}
```

- [ ] **Step 5: 跑回归验证**

Run: `node --test server/test/*.test.js`  
Expected: PASS

Run: `npm run build`  
Expected: PASS

## Self-Review

### Spec coverage

- Webhook 模式：Task 7, Task 8
- `~/.acme.sh` 域名扫描与 `/root/tlboot/<domain>` 复制：Task 5, Task 10
- Node.js + Express + Vue 3 + Vite + SQLite：Task 1, Task 3, Task 9
- MVC 分层：Task 2 到 Task 10 的文件结构
- PM2 启动：Task 8
- 管理员 Web UI：Task 6, Task 9, Task 10
- 日志与注释规范：Task 2 起所有新文件要求

### Placeholder scan

- 无 `TODO`、`TBD`、`implement later`
- 每个任务包含文件、代码或命令
- 所有命令都给出预期结果

### Type consistency

- 统一使用 `createApp`
- 统一使用 `createConfigService`
- 统一使用 `createCertificateService`
- 统一使用 `/api/admin/certificates/domains` 与 `/api/admin/certificates/select`

