# Telegram Bot Phase 1 设计说明

## 1. 文档概述

本文档定义 `TL-Telegram-Bot` 第一阶段实现方案，目标是从零构建一个基于 `Node.js + Express` 和 `Vue 3 + Vite` 的 Telegram 管理机器人系统。系统采用 MVC 架构，面向管理员监控与查询场景，使用 Telegram `Webhook` 模式接收消息，使用 `SQLite` 保存本地配置，并由服务自身直接监听 `443/https`。

本文档覆盖以下范围：

- Telegram Bot 服务整体架构
- 后端模块职责与调用边界
- Web UI 配置管理范围
- 本地证书扫描、复制与启用流程
- 数据存储设计
- 日志、注释、测试与部署要求

第一阶段明确不包含：

- 普通用户自助查询
- 受控写操作
- 多租户管理后台
- 外置反向代理 HTTPS 终止

## 2. 目标与约束

### 2.1 业务目标

实现一个可独立部署的 Telegram 机器人服务，支持：

- 管理员通过 `/bind <code>` 绑定 Telegram 账号
- 管理员通过机器人查询服务器健康状态、告警列表、单台服务器详情、用户概览
- 机器人通过轮询内部接口拉取待发送告警并推送
- 推送后向业务后端回执发送结果
- 管理员在 Web UI 中完成 Bot 配置、Webhook 配置、证书选择与状态查看

### 2.2 技术约束

- 后端：`Node.js + Express`
- 前端：`Vue 3 + Vite`
- 存储：`SQLite`
- 架构：MVC
- Bot 接收方式：`Webhook`
- HTTPS：Bot 服务自身监听 `443` 并直接加载证书
- 证书来源：默认扫描 `~/.acme.sh`
- 证书落地路径：`/root/tlboot/<domain>/fullchain.pem` 和 `/root/tlboot/<domain>/privkey.pem`
- 进程管理：`PM2`
- 日志格式：统一使用仓库内 `createLogger(module)` 规范

## 3. 推荐实现方案

采用“单仓库双应用，单进程对外”的结构：

- `server`：承载管理 API、Telegram Webhook、内部接口调用、证书扫描与配置持久化
- `web`：承载管理员配置页面，构建后由 `server` 静态托管
- `PM2`：仅启动后端服务，由后端统一监听 `443`

推荐原因：

- 比单文件单体更清晰，适合 MVC 分层
- 比三进程拆分更轻，适合第一阶段快速上线
- 后续可以继续拆分，但第一阶段不需要额外增加部署复杂度

## 4. 目录结构设计

建议目录结构如下：

```text
TL-Telegram-Bot/
├─ AGENTS.md
├─ docs/
│  └─ superpowers/
│     └─ specs/
├─ server/
│  ├─ src/
│  │  ├─ app.js
│  │  ├─ server.js
│  │  ├─ config/
│  │  ├─ controllers/
│  │  ├─ middlewares/
│  │  ├─ models/
│  │  ├─ repositories/
│  │  ├─ routes/
│  │  ├─ services/
│  │  ├─ utils/
│  │  └─ jobs/
│  ├─ storage/
│  └─ test/
├─ web/
│  ├─ src/
│  │  ├─ api/
│  │  ├─ components/
│  │  ├─ router/
│  │  ├─ views/
│  │  └─ styles/
│  └─ public/
└─ ecosystem.config.js
```

职责约束：

- `controllers` 只负责接收请求和返回响应
- `services` 只负责业务编排
- `repositories` 只负责 SQLite 读写
- `models` 负责数据实体和 DTO 说明
- `jobs` 负责定时任务，例如告警轮询
- `utils` 放置签名、日志、路径处理等纯工具逻辑

## 5. 后端模块设计

### 5.1 管理配置模块

职责：

- 保存 Bot Token、内部 API 地址、内部签名密钥、Webhook 路径、选定证书域名等配置
- 提供读取当前配置和保存配置的管理接口
- 对敏感配置做最基本的合法性校验

设计要点：

- 配置持久化到 SQLite
- 通过服务层统一读写配置，不允许控制器直接拼 SQL
- 启动时读取配置并决定是否具备 HTTPS 启动条件

### 5.2 证书管理模块

职责：

- 扫描 `~/.acme.sh` 下的候选域名目录
- 识别每个域名是否存在可用的 `fullchain.pem` 和 `privkey.pem`
- 复制选中的证书到 `/root/tlboot/<domain>/`
- 将当前启用证书路径写回配置

域名扫描规则：

- 默认以 `~/.acme.sh` 下一级目录为候选域名目录
- 仅当目录内同时存在可读取的证书文件时，视为可选
- Web UI 展示域名、源路径、目标路径、最近扫描结果

复制规则：

- 目标路径固定为 `/root/tlboot/<domain>/fullchain.pem`
- 目标路径固定为 `/root/tlboot/<domain>/privkey.pem`
- 若目标目录不存在，则自动创建
- 复制成功后立即做文件存在性校验

失败策略：

- 扫描失败：返回明确错误，不改动当前启用配置
- 复制失败：记录错误日志，不切换生效证书
- 校验失败：回滚配置写入，保留旧证书配置

### 5.3 Telegram API 模块

职责：

- 封装 Telegram Bot API 请求
- 设置和查询 Webhook
- 发送普通消息和告警消息

设计要点：

- 所有 Telegram 请求统一经过服务层封装
- 发送失败时返回可审计的错误信息
- 关键位置记录日志，例如注册 Webhook、发送消息、Telegram API 失败

### 5.4 Webhook 接收模块

职责：

- 对外暴露 Telegram Webhook 接口
- 接收 Telegram 更新并交给命令处理器
- 对消息体进行基础健壮性保护，忽略不支持的更新类型

支持的命令：

- `/bind <code>`
- `/status`
- `/servers`
- `/server <server_id>`
- `/alerts`
- `/user <email|user_id>`

命令执行规则：

- `/bind` 直接调用绑定接口
- 其余命令先调用 `GET /api/internal/telegram/admin/by-chat/:chatId`
- 未绑定管理员时直接回复提示，不继续调用后续内部接口

### 5.5 内部接口客户端模块

职责：

- 对接 `telegram-phase1-bot-api.md` 中定义的内部接口
- 统一生成签名请求头
- 统一处理业务错误码与 HTTP 错误

必须覆盖的接口：

- `GET /api/internal/telegram/health`
- `POST /api/internal/telegram/admin/bind/verify`
- `GET /api/internal/telegram/admin/by-chat/:chatId`
- `GET /api/internal/telegram/servers/health`
- `GET /api/internal/telegram/servers/health/:serverId`
- `GET /api/internal/telegram/alerts`
- `GET /api/internal/telegram/alerts/pending`
- `POST /api/internal/telegram/alerts/:alertId/sent`
- `GET /api/internal/telegram/admin/users/lookup`

签名规则：

- 按文档拼接 `METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + RAW_BODY`
- 使用 `HMAC-SHA256` 生成十六进制摘要
- 统一注入 `X-Internal-Client: telegram-bot`

### 5.6 告警轮询任务模块

职责：

- 定时拉取待发送告警
- 向每个接收人发送 Telegram 消息
- 向内部接口回执发送状态

执行流程：

1. 定时调用 `GET /api/internal/telegram/alerts/pending`
2. 遍历告警与接收人列表
3. 发送 Telegram 消息
4. 回执 `sent` 或 `failed`

约束：

- 第一阶段只做串行处理，保证日志和错误定位简单
- 单次任务失败不导致整个进程退出
- 重复发送控制暂由后端内部接口负责

## 6. 数据存储设计

SQLite 第一阶段最少包含以下表：

### 6.1 `system_configs`

用途：保存系统配置。

建议字段：

- `config_key`
- `config_value`
- `updated_at`

建议键：

- `telegram_bot_token`
- `internal_api_base_url`
- `internal_api_secret`
- `webhook_base_url`
- `webhook_path`
- `selected_certificate_domain`
- `tls_fullchain_path`
- `tls_privkey_path`
- `poll_alerts_enabled`
- `poll_alerts_interval_seconds`
- `admin_password_hash`

### 6.2 `admin_sessions`

用途：保存后台管理员会话。

建议字段：

- `session_token`
- `created_at`
- `expires_at`
- `last_seen_at`

### 6.3 `operation_logs`

用途：记录配置与运维操作。

建议字段：

- `id`
- `operator`
- `action_type`
- `action_detail`
- `created_at`

记录场景：

- 保存基础配置
- 选择证书域名
- 复制证书
- 注册 Webhook
- 手动触发健康检查

## 7. Web UI 设计

Web UI 只面向管理员，第一阶段提供以下页面：

### 7.1 登录页

功能：

- 使用本地管理员密码登录
- 登录后获取会话令牌

### 7.2 基础配置页

功能：

- 配置 Bot Token
- 配置内部 API 地址
- 配置内部签名 Secret
- 配置 Webhook 对外域名和路径
- 配置告警轮询开关与间隔

### 7.3 证书管理页

功能：

- 扫描 `~/.acme.sh`
- 展示可用域名列表
- 选择某个域名作为当前 HTTPS 证书
- 触发复制到 `/root/tlboot/<domain>/`
- 展示当前生效证书路径

### 7.4 运行状态页

功能：

- 展示配置完整度
- 展示内部接口健康检查结果
- 展示当前 Webhook 注册信息
- 展示当前启用域名证书信息

设计原则：

- 页面只做管理，不承载业务查询聊天能力
- 配置提交前做基础前端校验
- 所有关键操作在页面上展示明确的成功或失败结果

## 8. HTTP API 设计

除 Telegram Webhook 外，系统还需要提供管理员管理接口：

- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET /api/admin/config`
- `PUT /api/admin/config`
- `GET /api/admin/certificates/domains`
- `POST /api/admin/certificates/select`
- `POST /api/admin/webhook/register`
- `GET /api/admin/status/overview`

接口约束：

- 管理 API 必须先鉴权
- 响应结构尽量统一为 `{ code, message, data }`
- 错误信息优先可读，不只返回通用 500

## 9. HTTPS 与启动策略

启动方式采用 PM2 配置文件。

运行策略：

- 服务启动时读取当前已生效证书配置
- 若证书文件存在，则启动 HTTPS Server 并监听 `443`
- 若证书配置缺失或文件缺失，则进入“未就绪”状态，不注册 Webhook

推荐做法：

- 仍然启动基础管理能力，方便管理员先完成证书与配置设置
- 在未就绪状态下明确返回“HTTPS 证书未配置完成”

需要注意：

- 由于目标证书路径位于 `/root/tlboot`，生产部署时需要保证进程账户具备读取权限
- 从 `~/.acme.sh` 复制证书也需要进程具备读取源目录与写入目标目录的权限

## 10. 日志与注释规范

日志规范：

- 使用统一 `createLogger(module)` 工具
- 关键日志点必须覆盖：
  - 服务启动
  - HTTPS 证书加载
  - Webhook 注册
  - 收到 Telegram 更新
  - 调用内部接口
  - 复制证书
  - 管理配置变更
  - 告警轮询与回执

注释规范：

- 新建文件必须有整体概述注释
- 新增方法必须注明职责、关键参数、返回值或关键分支语义
- 非显然逻辑添加简洁注释，不堆砌无意义说明

## 11. 测试策略

第一阶段至少覆盖以下验证：

- 内部接口签名生成正确
- 证书扫描逻辑正确识别可用域名
- 证书复制逻辑能正确创建目标目录并完成覆盖
- Telegram Webhook 路由能接收标准消息更新
- `/bind`、`/status`、`/server`、`/alerts`、`/user` 命令分发正确
- 告警轮询能正确回执 `sent` 和 `failed`
- 管理配置 API 能正确读写 SQLite

测试分层：

- 单元测试：工具函数、服务函数、仓储函数
- 集成测试：Webhook 路由、管理 API、SQLite 持久化
- 人工联调：对接真实 Telegram Webhook 与业务内部接口

## 12. 部署设计

PM2 配置包含：

- 服务入口脚本
- `NODE_ENV`
- 监听端口
- 数据库文件路径
- 日志输出路径

部署步骤建议：

1. 安装依赖
2. 配置管理员初始密码和 Bot Token
3. 在 Web UI 中选择证书域名
4. 完成证书复制与启用
5. 启动 PM2 服务
6. 注册 Telegram Webhook
7. 验证 `/bind` 与 `/status`

## 13. 风险与边界

已知风险：

- `/root/tlboot` 与 `~/.acme.sh` 是 Linux 路径，开发环境若为 Windows，需要通过配置或部署环境验证
- 如果进程没有读取或复制证书权限，HTTPS 启动会失败
- 如果 Telegram Webhook 未成功注册，Bot 无法接收消息
- 如果内部 API 不可达，Bot 命令只会返回失败提示，不应阻塞主服务

第一阶段处理原则：

- 优先保证可观测性和错误可定位
- 优先保证配置与证书切换安全
- 避免过早引入多进程、多节点或复杂任务队列

## 14. 后续实现计划范围

下一阶段实现计划应覆盖：

- 项目初始化与依赖选择
- SQLite 表结构与初始化逻辑
- 后端 MVC 骨架
- Web UI 页面骨架
- Telegram Webhook 与内部 API 客户端
- 证书管理流程
- PM2 配置与运行文档
