# Telegram Bot 第一期内部接口文档

> 适用范围：独立部署的 Telegram Bot 服务对接当前业务后端的第一阶段内部接口  
> 文档目标：让 Bot 程序可以直接按本文档完成签名、绑定、状态查询、告警拉取与告警回执  
> 接口前缀：`/api/internal/telegram`

---

## 1. 对接说明

第一阶段只面向管理员监控场景，主要能力包括：

- Bot 自检业务后端内部接口是否可用
- 管理员通过绑定码完成 Telegram 账号绑定
- Bot 根据 `chat_id` 判断当前会话是否已绑定管理员
- Bot 查询服务器健康总览和单台服务器详情
- Bot 查询当前告警列表
- Bot 拉取待发送告警
- Bot 在发送 Telegram 消息后回执发送结果
- Bot 代查用户概览

第一阶段**不包含**用户自助查询，也**不包含**受控写操作。

---

## 2. 鉴权方式

所有接口都要求以下请求头：

| 请求头 | 必填 | 说明 |
|------|------|------|
| `X-Internal-Client` | 是 | 固定为 `telegram-bot` |
| `X-Internal-Timestamp` | 是 | 秒级 Unix 时间戳 |
| `X-Internal-Signature` | 是 | HMAC-SHA256 签名 |
| `Content-Type` | 否 | JSON 请求建议使用 `application/json` |

签名原文拼接规则：

```text
METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + RAW_BODY
```

说明：

- `METHOD`：大写 HTTP 方法，例如 `GET`、`POST`
- `PATH`：请求路径，**包含查询字符串**
- `TIMESTAMP`：请求头中的 `X-Internal-Timestamp`
- `RAW_BODY`：原始请求体字符串；如果没有请求体，则为空字符串

签名算法：

```text
hex(HMAC-SHA256(secret, signature_payload))
```

示例：

```text
POST
/api/internal/telegram/admin/bind/verify
1770000000
{"bind_code":"TG-ADMIN-ABCD1234","chat_id":"123456789"}
```

---

## 3. 通用返回格式

成功返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

失败返回：

```json
{
  "code": 500,
  "message": "服务器内部错误",
  "data": null
}
```

---

## 4. 通用失败示例

### 4.1 内部鉴权失败

适用场景：

- 缺少签名请求头
- `X-Internal-Client` 不是 `telegram-bot`
- 时间戳超出允许范围
- HMAC 签名不正确

返回示例：

```json
{
  "code": 1002,
  "message": "内部接口鉴权失败",
  "data": null
}
```

### 4.2 参数校验失败

返回示例：

```json
{
  "code": 1001,
  "message": "chat_id 不能为空",
  "data": null
}
```

### 4.3 当前会话未绑定管理员

适用场景：

- 需要管理员权限的接口，传入的 `chat_id` 未绑定管理员

返回示例：

```json
{
  "code": 1004,
  "message": "当前 chat 未绑定管理员",
  "data": null
}
```

---

## 5. 接口清单

### 5.1 健康检查

#### `GET /api/internal/telegram/health`

接口作用：

- Bot 启动时探活
- 定时检查业务后端内部 API 是否可达

请求参数：

- 无

请求示例：

```http
GET /api/internal/telegram/health
X-Internal-Client: telegram-bot
X-Internal-Timestamp: 1770000000
X-Internal-Signature: <signature>
```

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "service": "subscription-manager",
    "status": "ok",
    "time": 1770000000
  }
}
```

失败返回示例：

```json
{
  "code": 1002,
  "message": "内部接口鉴权失败",
  "data": null
}
```

---

### 5.2 管理员绑定码校验

#### `POST /api/internal/telegram/admin/bind/verify`

接口作用：

- Bot 收到管理员发送的 `/bind <code>` 后调用
- 校验绑定码并建立管理员账号与 Telegram 会话的绑定关系

请求体示例：

```json
{
  "bind_code": "TG-ADMIN-ABCD1234",
  "chat_id": "123456789",
  "telegram_user_id": "99887766",
  "telegram_username": "admin_tg",
  "telegram_first_name": "Tom",
  "telegram_last_name": "Lee"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bind_code` | string | 是 | 后台生成的管理员绑定码 |
| `chat_id` | string | 是 | 当前 Telegram 会话 ID |
| `telegram_user_id` | string | 否 | Telegram 用户 ID |
| `telegram_username` | string | 否 | Telegram 用户名 |
| `telegram_first_name` | string | 否 | Telegram 名 |
| `telegram_last_name` | string | 否 | Telegram 姓 |

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "admin_id": 1,
    "username": "admin",
    "role": "admin",
    "bound": true
  }
}
```

失败返回示例 1：绑定码无效

```json
{
  "code": 4001,
  "message": "绑定码无效",
  "data": null
}
```

失败返回示例 2：绑定码已过期

```json
{
  "code": 4001,
  "message": "绑定码已过期",
  "data": null
}
```

失败返回示例 3：当前 chat 已绑定其他管理员

```json
{
  "code": 4001,
  "message": "当前 chat 已绑定其他管理员",
  "data": null
}
```

---

### 5.3 按 chat_id 查询管理员身份

#### `GET /api/internal/telegram/admin/by-chat/:chatId`

接口作用：

- Bot 在执行管理员命令前确认当前会话是否已绑定管理员
- 可用于 `/status`、`/servers`、`/alerts`、`/user` 等命令前置鉴权

路径参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `chatId` | string | Telegram 会话 ID |

请求示例：

```http
GET /api/internal/telegram/admin/by-chat/123456789
X-Internal-Client: telegram-bot
X-Internal-Timestamp: 1770000000
X-Internal-Signature: <signature>
```

成功返回示例：已绑定

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "bound": true,
    "binding_id": 1,
    "admin_id": 1,
    "username": "admin",
    "status": "active",
    "is_super": true
  }
}
```

成功返回示例：未绑定

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "bound": false
  }
}
```

失败返回示例：

```json
{
  "code": 1002,
  "message": "内部接口鉴权失败",
  "data": null
}
```

---

### 5.4 查询服务器健康总览

#### `GET /api/internal/telegram/servers/health`

接口作用：

- 对应 Bot 的 `/status` 或 `/servers`
- 返回服务器总览与可选服务器明细

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `chat_id` | string | 是 | 当前 Telegram 会话 ID |
| `include_servers` | string/number | 否 | 传 `1` 时 Bot 可按明细展示 |

请求示例：

```http
GET /api/internal/telegram/servers/health?chat_id=123456789&include_servers=1
X-Internal-Client: telegram-bot
X-Internal-Timestamp: 1770000000
X-Internal-Signature: <signature>
```

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "total_servers": 2,
    "healthy_servers": 1,
    "unhealthy_servers": 1,
    "last_check_at": 1770000200,
    "servers": [
      {
        "server_id": 1,
        "server_name": "香港-01",
        "panel_api_status": "healthy",
        "panel_auth_status": "healthy",
        "xray_runtime_status": "healthy",
        "consecutive_failures": 0
      },
      {
        "server_id": 2,
        "server_name": "日本-01",
        "panel_api_status": "unhealthy",
        "panel_auth_status": "unknown",
        "xray_runtime_status": "unknown",
        "consecutive_failures": 2
      }
    ]
  }
}
```

失败返回示例：当前 chat 未绑定管理员

```json
{
  "code": 1004,
  "message": "当前 chat 未绑定管理员",
  "data": null
}
```

---

### 5.5 查询单台服务器健康详情

#### `GET /api/internal/telegram/servers/health/:serverId`

接口作用：

- 对应 Bot 的 `/server <server_id>`
- 返回一台服务器当前巡检状态和故障细节

路径参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `serverId` | number | 服务器 ID |

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `chat_id` | string | 是 | 当前 Telegram 会话 ID |

请求示例：

```http
GET /api/internal/telegram/servers/health/2?chat_id=123456789
X-Internal-Client: telegram-bot
X-Internal-Timestamp: 1770000000
X-Internal-Signature: <signature>
```

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "server_id": 2,
    "server_name": "日本-01",
    "server_host": "jp01.example.com",
    "panel_api_status": "unhealthy",
    "panel_auth_status": "unknown",
    "xray_runtime_status": "unknown",
    "last_success_at": 1770000100,
    "last_failure_at": 1770000000,
    "last_checked_at": 1770000200,
    "consecutive_failures": 2,
    "failure_reason": "panel_unreachable",
    "failure_detail": "connect timeout"
  }
}
```

失败返回示例：服务器健康记录不存在

```json
{
  "code": 404,
  "message": "服务器健康记录不存在",
  "data": null
}
```

---

### 5.6 查询告警列表

#### `GET /api/internal/telegram/alerts`

接口作用：

- 对应 Bot 的 `/alerts`
- 返回当前告警列表，便于管理员在 Telegram 中查看最近异常

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `chat_id` | string | 是 | 当前 Telegram 会话 ID |
| `status` | string | 否 | 告警状态，例如 `open` |
| `limit` | number | 否 | 返回条数，建议 10~20 |

请求示例：

```http
GET /api/internal/telegram/alerts?chat_id=123456789&status=open&limit=10
X-Internal-Client: telegram-bot
X-Internal-Timestamp: 1770000000
X-Internal-Signature: <signature>
```

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      {
        "alert_id": 10,
        "server_id": 2,
        "server_name": "日本-01",
        "alert_type": "panel_unreachable",
        "status": "open",
        "title": "日本-01 面板巡检异常",
        "message": "connect timeout",
        "first_triggered_at": 1770000000,
        "last_triggered_at": 1770000200,
        "resolved_at": null,
        "send_count": 1
      }
    ]
  }
}
```

失败返回示例：

```json
{
  "code": 1004,
  "message": "当前 chat 未绑定管理员",
  "data": null
}
```

---

### 5.7 拉取待发送告警

#### `GET /api/internal/telegram/alerts/pending`

接口作用：

- Bot 定时轮询待发送告警
- 返回告警内容和需要推送的接收人列表

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | number | 否 | 返回条数，建议 10~50 |

请求示例：

```http
GET /api/internal/telegram/alerts/pending?limit=10
X-Internal-Client: telegram-bot
X-Internal-Timestamp: 1770000000
X-Internal-Signature: <signature>
```

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      {
        "alert_id": 10,
        "server_id": 2,
        "server_name": "日本-01",
        "alert_type": "panel_unreachable",
        "status": "open",
        "title": "日本-01 面板巡检异常",
        "message": "connect timeout",
        "recipients": [
          {
            "binding_id": 1,
            "chat_id": "123456789"
          }
        ]
      }
    ]
  }
}
```

失败返回示例：

```json
{
  "code": 1002,
  "message": "内部接口鉴权失败",
  "data": null
}
```

---

### 5.8 告警发送回执

#### `POST /api/internal/telegram/alerts/:alertId/sent`

接口作用：

- Bot 发送 Telegram 告警消息后回执发送结果
- 后端据此记录最近发送状态、发送次数和消息 ID

路径参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `alertId` | number | 告警 ID |

请求体示例：

```json
{
  "result_status": "sent",
  "delivered_count": 1,
  "telegram_message_id": "555",
  "result_message": "ok"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `result_status` | string | 是 | `sent` 或 `failed` |
| `delivered_count` | number | 否 | 成功送达人数 |
| `telegram_message_id` | string | 否 | Telegram 返回的消息 ID |
| `result_message` | string | 否 | 发送结果说明 |

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "alert_id": 10,
    "result_status": "sent",
    "delivered_count": 1,
    "sent_at": 1770000300
  }
}
```

失败返回示例：参数不合法

```json
{
  "code": 1001,
  "message": "result_status 必须是 sent 或 failed",
  "data": null
}
```

---

### 5.9 管理员代查用户概览

#### `GET /api/internal/telegram/admin/users/lookup`

接口作用：

- 对应 Bot 的 `/user`
- 允许管理员通过 `email` 或 `user_id` 查询用户概览

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `chat_id` | string | 是 | 当前 Telegram 会话 ID |
| `email` | string | 否 | 用户邮箱 |
| `user_id` | number | 否 | 用户 ID |

说明：

- `email` 和 `user_id` 至少传一个
- 如果两个都传，后端优先使用 `user_id`

请求示例 1：按邮箱查询

```http
GET /api/internal/telegram/admin/users/lookup?chat_id=123456789&email=demo%40example.com
X-Internal-Client: telegram-bot
X-Internal-Timestamp: 1770000000
X-Internal-Signature: <signature>
```

请求示例 2：按用户 ID 查询

```http
GET /api/internal/telegram/admin/users/lookup?chat_id=123456789&user_id=101
X-Internal-Client: telegram-bot
X-Internal-Timestamp: 1770000000
X-Internal-Signature: <signature>
```

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "user_id": 101,
    "email": "demo@example.com",
    "enabled": 1,
    "plan_name": "标准套餐",
    "traffic_used": 1024,
    "traffic_limit": 2048,
    "traffic_used_text": "1 KB",
    "traffic_limit_text": "2 KB",
    "expire_at": 1770000000,
    "sync_status": 0
  }
}
```

失败返回示例 1：未绑定管理员

```json
{
  "code": 1004,
  "message": "当前 chat 未绑定管理员",
  "data": null
}
```

失败返回示例 2：用户不存在

```json
{
  "code": 2004,
  "message": "用户不存在",
  "data": null
}
```

失败返回示例 3：缺少查询条件

```json
{
  "code": 1001,
  "message": "email 和 user_id 至少需要一个",
  "data": null
}
```

---

## 6. Bot 侧建议调用顺序

### 6.1 管理员绑定流程

1. 管理员在后台生成绑定码
2. 管理员在 Telegram 中发送 `/bind <code>`
3. Bot 调用 `POST /api/internal/telegram/admin/bind/verify`
4. 成功后提示“绑定成功”

### 6.2 管理员命令鉴权流程

1. Bot 收到管理员命令
2. 先调用 `GET /api/internal/telegram/admin/by-chat/:chatId`
3. `bound=true` 才继续调用其他接口
4. `bound=false` 时提示先绑定管理员身份

### 6.3 告警推送流程

1. Bot 定时调用 `GET /api/internal/telegram/alerts/pending`
2. 对每条告警逐个向 `recipients` 推送 Telegram 消息
3. 推送完成后调用 `POST /api/internal/telegram/alerts/:alertId/sent`
4. 如果发送失败，也建议回执 `result_status=failed`

---

## 7. 本地模拟测试脚本

仓库内已提供第一阶段内部接口的模拟测试脚本：

```bash
node server/test/test-telegram-internal-api.js
```

该脚本使用模拟数据覆盖第一阶段全部内部接口，可作为 Bot 对接前的本地参考。

