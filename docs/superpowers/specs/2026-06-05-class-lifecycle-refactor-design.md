# Class 化对象生命周期改造方案

## 背景

当前后端大量采用 `createXxx(options)` 工厂函数创建运行时、服务、控制器、路由和仓储对象。该写法依赖闭包保存状态，再通过返回对象暴露方法，例如 `createRuntime`、`createListeningServer`、`createTelegramCommandService`。这种风格对熟悉 C++ 的维护者不够直观：调用方看不到明确的对象生命周期，依赖关系也不集中在构造函数中。

本次改造目标不是只把 `createXxx` 内部改成 `class`，而是统一调整为：

> Class 化对象生命周期 + 调用方同步改为 `new Class(...)` + `createXxx` 仅临时兼容。

## 改造目标

1. 生产代码调用方使用 `new ClassName(...)` 创建运行时、服务、控制器、路由和仓储实例。
2. 每个对象的依赖注入集中在 `constructor` 中，公开能力以实例方法表达。
3. `createXxx(...)` 仅作为迁移期兼容包装，内部直接返回 `new ClassName(...)`，不再承载业务逻辑。
4. 保持现有 CommonJS 模块体系、MVC 分层、日志格式、接口行为和测试注入能力不变。
5. 分阶段改造，避免一次性大范围替换导致启动链、路由绑定或测试 mock 大面积失效。

## 调用形式

目标调用方式示例：

```js
const runtime = new Runtime({
  env: options.env,
  fetchImpl: global.fetch
});

const adminRoutes = new AdminRoutes({
  runtime
});

const appBuilder = new AppBuilder({
  adminRoutes,
  commandService: runtime.commandService
});
const app = appBuilder.build();

const listeningServer = new ListeningServer({
  app,
  runtimeEnv,
  listenPort
});
const appServer = listeningServer.start();
```

兼容包装只允许保持如下形态：

```js
function createRuntime(options = {}) {
  return new Runtime(options);
}
```

## 需要改造的文件清单

### 启动与运行时

- `server/src/bootstrap/create-runtime.js`
  - `createRuntime` 改为 `Runtime`
  - `createJobsRuntime` 改为 `JobsRuntime` 或直接复用 `Runtime`
- `server/src/bootstrap/create-server.js`
  - `createListeningServer` 改为 `ListeningServer`
- `server/src/server.js`
  - `startServer` 可保留为启动入口函数，但内部必须使用 `new Runtime(...)`、`new ListeningServer(...)`
  - `createRuntimeAdminRoutes` 改为直接实例化 `AdminRoutes`
- `server/src/app.js`
  - `createApp` 改为 `AppBuilder` 或 `Application`

### 路由层

- `server/src/routes/admin-routes.js`
  - `createAdminRoutes` 改为 `AdminRoutes`
  - `createFallbackConfigService` 改为 `FallbackConfigService` 或迁移到测试辅助/默认服务类
- `server/src/routes/webhook-routes.js`
  - `createWebhookRoutes` 改为 `WebhookRoutes`

### 控制器层

- `server/src/controllers/admin-auth-controller.js`
  - `createAdminAuthController` 改为 `AdminAuthController`
- `server/src/controllers/admin-config-controller.js`
  - `createAdminConfigController` 改为 `AdminConfigController`
- `server/src/controllers/certificate-controller.js`
  - `createCertificateController` 改为 `CertificateController`
- `server/src/controllers/status-controller.js`
  - `createStatusController` 改为 `StatusController`
- `server/src/controllers/webhook-controller.js`
  - `createWebhookController` 改为 `WebhookController`

### 服务层

- `server/src/services/admin-auth-service.js`
  - `createAdminAuthService` 改为 `AdminAuthService`
- `server/src/services/admin-login-attempt-service.js`
  - `createAdminLoginAttemptService` 改为 `AdminLoginAttemptService`
- `server/src/services/certificate-service.js`
  - `createCertificateService` 改为 `CertificateService`
- `server/src/services/config-service.js`
  - `createConfigService` 改为 `ConfigService`
- `server/src/services/filesystem-service.js`
  - `createFilesystemService` 改为 `FilesystemService`
- `server/src/services/https-state-service.js`
  - `createHttpsStateService` 改为 `HttpsStateService`
- `server/src/services/internal-api-service.js`
  - `createInternalApiService` 改为 `InternalApiService`
- `server/src/services/telegram-api-service.js`
  - `createTelegramApiService` 改为 `TelegramApiService`
- `server/src/services/telegram-alert-polling-service.js`
  - `createTelegramAlertPollingService` 改为 `TelegramAlertPollingService`
- `server/src/services/telegram-command-service.js`
  - `createTelegramCommandService` 改为 `TelegramCommandService`

### 仓储、配置与工具

- `server/src/repositories/config-repository.js`
  - `createConfigRepository` 改为 `ConfigRepository`
- `server/src/repositories/session-repository.js`
  - `createSessionRepository` 改为 `SessionRepository`
- `server/src/repositories/operation-log-repository.js`
  - `createOperationLogRepository` 改为 `OperationLogRepository`
- `server/src/config/database.js`
  - `createDatabase` 改为 `DatabaseManager` 或 `SqliteDatabase`
- `server/src/config/env.js`
  - `createStartupConfigContext` 改为 `StartupConfigContext`
- `server/src/utils/path-resolver.js`
  - `createPathResolver` 改为 `PathResolver`
- `server/src/utils/logger.js`
  - 日志工具可保留 `createLogger`，也可新增 `Logger` 类；由于调用点多且无复杂生命周期，建议最后处理。

## 分阶段计划

### 第一阶段：启动链 Class 化

优先改造 `Runtime`、`ListeningServer`、`AppBuilder` 和 `server.js` 调用链。目标是让启动入口读起来像对象生命周期，而不是一组工厂函数串联。

完成标准：

- `server.js` 生产启动链使用 `new Runtime(...)`、`new ListeningServer(...)`。
- `createRuntime`、`createListeningServer` 只保留兼容包装。
- 启动行为、HTTPS 降级逻辑、jobs 启动时机不变。

### 第二阶段：MVC 主体 Class 化

改造路由、控制器、服务、仓储。路由类提供 `getRouter()` 方法，控制器公开可直接传给 Express 的已绑定方法。

完成标准：

- 生产代码不再通过 `createAdminRoutes(...)`、`createWebhookRoutes(...)` 创建路由。
- 控制器方法不会因为 Express 回调丢失 `this`。
- 服务与仓储的依赖都能从 `constructor` 直接读到。

### 第三阶段：工具与兼容层清理

当生产调用方和测试全部改为 `new ClassName(...)` 后，逐步删除 `createXxx` 兼容包装。日志工具可单独评估是否保持现状。

完成标准：

- 生产代码中不存在新增的 `createXxx(...)` 生命周期调用。
- 旧兼容包装要么已删除，要么有明确保留原因。
- 新增文件遵守 `AGENTS.md` 的 Class 化对象生命周期规则。

## 关键实现约束

1. 保持 CommonJS，不引入 TypeScript 或 ESM 迁移。
2. 保持现有接口响应、Telegram webhook 路径、管理端路由路径不变。
3. 保留依赖注入能力，测试仍可传入 fake database、fake fetch、fake express、fake scheduler。
4. Express 回调必须绑定实例上下文。
5. 新建类和新增方法必须补充中文注释，说明职责、关键参数和核心分支语义。
6. 改造过程中注意中文注释编码，避免把已有文件改成乱码或扩大无关 diff。

## 测试策略

每个阶段完成后执行对应验证：

1. 单文件语法检查：`node --check <file>`
2. 相关测试：`node --test server/test/<target>.test.js`
3. 全量后端测试：`npm run check`

如果某个阶段只改文档或只改兼容包装，可先跑语法检查和最小相关测试；进入启动链和路由改造后，必须跑全量后端测试。

## 风险与规避

1. `this` 丢失风险：控制器和路由回调必须在构造函数中绑定。
2. 循环依赖风险：类拆分时保持原模块边界，先不移动文件。
3. 测试 mock 失效风险：保留迁移期兼容包装，分批调整测试。
4. 大 diff 风险：按启动链、MVC 主体、工具层分批提交，避免一次性重写全部文件。
5. 编码风险：修改中文注释前先确认文件可读性，避免 PowerShell 显示乱码误导实际文件内容。
