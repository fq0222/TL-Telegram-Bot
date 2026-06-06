# AGENTS.md

## 仓库协作规则

### 代码提交

1. 可以 `git commit` 提交本地更改。
2. 刚写完但用户没有明确要求提交的文件，不要 `git add`，避免用户后续难以定位未确认的改动。
3. `git push` 前必须展示变更并获得用户同意。
4. commit 信息必须使用中文书写。
5. 新建文件和新增方法必须保持与当前项目一致的代码风格。
6. 新建文件和新增方法必须补充注释，至少说明职责、关键参数和核心分支语义。

### Class 化对象生命周期

1. 后端新增运行时、服务、控制器、路由、仓储、基础设施封装时，默认采用 `class` 表达对象生命周期。
2. 调用方也必须同步使用 `new ClassName(...)` 创建对象，不能只把 `createXxx` 内部改成 `class` 后继续让生产代码调用 `createXxx(...)`。
3. `createXxx(...)` 只允许作为迁移期兼容包装存在，包装内部应直接 `return new ClassName(...)`，并在改造计划中明确后续删除时机。
4. 依赖注入统一放在 `constructor` 中，公开业务能力放在实例方法中，便于从调用方沿 `new ClassName(...) -> constructor -> method` 阅读调用链。
5. Express 路由回调、定时任务回调等会丢失 `this` 的场景，必须在构造函数中显式绑定方法，或使用稳定的实例方法包装，避免运行期上下文丢失。

## 当前仓库附加要求

- 技术架构使用后端 `Node.js + Express`、前端 `Vue 3 + Vite`。
- 管理端页面仅提供管理员配置管理能力。
- 若机器人服务需要本地配置存储，默认使用 `SQLite`。
- 后端开发采用 MVC 架构。
- 文件需包含整体概述注释。
- 函数接口需包含注释。
- 关键位置必须打印日志。
- 日志工具默认采用以下格式：

```js
function getLocalTime() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

/**
 * 创建日志工具实例
 * @param {string} module - 模块名称
 * @returns {Object} 日志工具
 */
function createLogger(module) {
  return {
    info: (msg) => console.log(`[${module}] [INFO] ${getLocalTime()} - ${msg}`),
    error: (msg) => console.error(`[${module}] [ERROR] ${getLocalTime()} - ${msg}`),
    warn: (msg) => console.warn(`[${module}] [WARN] ${getLocalTime()} - ${msg}`)
  };
}

module.exports = { createLogger };
```

## 本期实现约束

- Telegram Bot 使用 `Webhook` 模式接收消息。
- Web UI 需要支持读取 `~/.acme.sh` 下的域名证书供管理员选择。
- 选中的证书文件复制到 `/root/tlboot/<domain>/fullchain.pem` 和 `/root/tlboot/<domain>/privkey.pem`。
- Bot 服务自己监听 `443/https` 并直接加载证书。
