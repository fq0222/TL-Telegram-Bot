# Telegram 机器人独立部署 API 详细设计

## 背景

本文件定义 Telegram 机器人独立部署场景下，主业务服务需要提供给机器人服务访问的内部 API。API 设计按三个阶段组织：

1. 第一阶段：管理员巡检与告警
2. 第二阶段：用户自助查询
3. 第三阶段：受控写操作

目标是让机器人作为独立服务存在，但所有业务规则、权限判断、数据真相和高风险操作仍由主业务服务统一控制。

## 设计原则

1. 所有机器人专用接口统一使用内部前缀，与普通前端 API 隔离。
2. 所有接口都需要服务间鉴权。
3. 关键业务接口即使服务间鉴权通过，也要继续做 chat 绑定身份鉴权。
4. 第一阶段以只读和告警拉取为主。
5. 第三阶段才开放写接口。

## API 前缀建议

统一使用：

`/api/internal/telegram/*`

## 服务间鉴权

所有接口都要求以下请求头：

- `X-Internal-Client`
- `X-Internal-Timestamp`
- `X-Internal-Signature`

推荐规则：

- `X-Internal-Client` 固定为 `telegram-bot`
- `X-Internal-Timestamp` 使用 Unix 时间戳
- `X-Internal-Signature` 使用 HMAC-SHA256

签名串建议为：

```text
METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + RAW_BODY
```

## 通用响应格式

建议复用现有项目风格：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

业务失败示例：

```json
{
  "code": 4001,
  "message": "绑定码无效",
  "data": null
}
```

## 第一阶段 API 设计

## 1. 服务健康检查

### `GET /api/internal/telegram/health`

### 用途

机器人服务检查主业务服务内部 API 是否可用。

### 权限

- 仅要求服务间鉴权

### 请求参数

无

### 返回示例

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

## 2. 管理员绑定接口

### `POST /api/internal/telegram/admin/bind/verify`

### 用途

管理员在 Telegram 发送绑定码后，由机器人调用该接口完成绑定。

### 权限

- 服务间鉴权

### 请求体

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

### 处理逻辑

1. 校验绑定码是否存在。
2. 校验绑定码是否过期。
3. 校验绑定码是否已使用。
4. 绑定到对应管理员账号。
5. 写入管理员绑定表。
6. 让绑定码失效。

### 成功返回

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

### 失败场景

- 绑定码无效
- 绑定码过期
- 绑定码已使用
- chat 已被其他管理员绑定

## 3. 管理员身份查询

### `GET /api/internal/telegram/admin/by-chat/:chatId`

### 用途

机器人收到管理员命令时，确认该 chat 是否已绑定管理员账号。

### 权限

- 服务间鉴权

### 路径参数

- `chatId`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "bound": true,
    "admin_id": 1,
    "username": "admin",
    "status": "active"
  }
}
```

### 未绑定返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "bound": false
  }
}
```

## 4. 服务器健康总览

### `GET /api/internal/telegram/servers/health`

### 用途

用于 `/status` 和 `/servers` 命令。

### 权限

- 服务间鉴权
- 业务侧需校验请求目标 chat 为管理员

### 查询参数

- `chat_id`
- `include_servers`

示例：

`GET /api/internal/telegram/servers/health?chat_id=123456789&include_servers=1`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "total_servers": 5,
    "healthy_servers": 4,
    "unhealthy_servers": 1,
    "last_check_at": 1770000000,
    "servers": [
      {
        "server_id": 1,
        "server_name": "香港-01",
        "panel_api_status": "healthy",
        "panel_auth_status": "healthy",
        "xray_runtime_status": "healthy",
        "consecutive_failures": 0
      }
    ]
  }
}
```

## 5. 单台服务器健康详情

### `GET /api/internal/telegram/servers/health/:serverId`

### 用途

用于 `/server <server_id>` 命令。

### 权限

- 服务间鉴权
- 业务侧需校验管理员身份

### 路径参数

- `serverId`

### 查询参数

- `chat_id`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "server_id": 1,
    "server_name": "香港-01",
    "server_host": "hk01.example.com",
    "panel_api_status": "healthy",
    "panel_auth_status": "healthy",
    "xray_runtime_status": "unhealthy",
    "last_success_at": 1770000100,
    "last_failure_at": 1770000000,
    "last_checked_at": 1770000200,
    "consecutive_failures": 2,
    "failure_reason": "xray stopped",
    "failure_detail": "状态接口返回 xrayStatus=stopped"
  }
}
```

## 6. 告警列表查询

### `GET /api/internal/telegram/alerts`

### 用途

用于 `/alerts` 命令。

### 权限

- 服务间鉴权
- 业务侧需校验管理员身份

### 查询参数

- `chat_id`
- `status`
- `limit`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      {
        "alert_id": 10,
        "server_id": 1,
        "server_name": "香港-01",
        "alert_type": "xray_not_running",
        "status": "open",
        "title": "Xray 未运行",
        "message": "状态接口返回 xrayStatus=stopped",
        "first_triggered_at": 1770000000,
        "last_triggered_at": 1770000300,
        "resolved_at": null,
        "send_count": 1
      }
    ]
  }
}
```

## 7. 拉取待发送告警

### `GET /api/internal/telegram/alerts/pending`

### 用途

机器人定时拉取待发送告警，是独立部署阶段一的关键接口。

### 权限

- 仅要求服务间鉴权

### 查询参数

- `limit`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      {
        "alert_id": 10,
        "alert_type": "xray_not_running",
        "server_id": 1,
        "server_name": "香港-01",
        "status": "open",
        "title": "Xray 未运行",
        "message": "状态接口返回 xrayStatus=stopped",
        "first_triggered_at": 1770000000,
        "last_triggered_at": 1770000300,
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

## 8. 告警发送成功回执

### `POST /api/internal/telegram/alerts/:alertId/sent`

### 用途

机器人完成 Telegram 消息发送后回执主业务服务，避免重复发送。

### 权限

- 服务间鉴权

### 路径参数

- `alertId`

### 请求体

```json
{
  "sent_at": 1770000400,
  "results": [
    {
      "chat_id": "123456789",
      "success": true,
      "telegram_message_id": "1001",
      "error_message": ""
    }
  ]
}
```

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "updated": true
  }
}
```

## 9. 管理员代查用户流量概览

### `GET /api/internal/telegram/admin/users/lookup`

### 用途

用于管理员 `/user <email或id>` 命令。

### 权限

- 服务间鉴权
- 业务侧需校验管理员身份

### 查询参数

- `chat_id`
- `email`
- `user_id`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "user_id": 101,
    "email": "user@example.com",
    "enabled": 1,
    "plan_name": "标准套餐",
    "traffic_used": 5368709120,
    "traffic_limit": 10737418240,
    "traffic_used_text": "5 GB",
    "traffic_limit_text": "10 GB",
    "expire_at": 1773000000,
    "sync_status": "success"
  }
}
```

## 第二阶段 API 设计

## 10. 用户绑定校验

### `POST /api/internal/telegram/user/bind/verify`

### 用途

用户在 Telegram 中执行绑定命令后，由机器人调用该接口完成绑定。

### 权限

- 服务间鉴权

### 请求体

```json
{
  "bind_code": "TG-USER-EFGH5678",
  "chat_id": "123456789",
  "telegram_user_id": "99887766",
  "telegram_username": "user_tg",
  "telegram_first_name": "Alice",
  "telegram_last_name": "Wang"
}
```

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "user_id": 101,
    "email": "user@example.com",
    "bound": true
  }
}
```

## 11. 通过 chat 查询用户绑定关系

### `GET /api/internal/telegram/user/by-chat/:chatId`

### 用途

机器人收到普通用户命令时，用来识别当前 chat 是否已绑定用户。

### 权限

- 服务间鉴权

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "bound": true,
    "user_id": 101,
    "email": "user@example.com",
    "enabled": 1,
    "status": "active"
  }
}
```

## 12. 用户解绑

### `POST /api/internal/telegram/user/unbind`

### 用途

解除当前 Telegram chat 与用户的绑定。

### 权限

- 服务间鉴权

### 请求体

```json
{
  "chat_id": "123456789",
  "telegram_user_id": "99887766"
}
```

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "unbound": true
  }
}
```

## 13. 当前用户基础信息

### `GET /api/internal/telegram/user/me`

### 用途

用于 `/me` 命令。

### 权限

- 服务间鉴权
- 业务侧需校验该 chat 已绑定用户

### 查询参数

- `chat_id`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "user_id": 101,
    "email": "user@example.com",
    "enabled": 1,
    "plan_name": "标准套餐",
    "expire_at": 1773000000
  }
}
```

## 14. 当前用户流量信息

### `GET /api/internal/telegram/user/usage`

### 用途

用于 `/usage` 命令。

### 权限

- 服务间鉴权
- 业务侧需校验用户身份

### 查询参数

- `chat_id`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "traffic_used": 5368709120,
    "traffic_limit": 10737418240,
    "traffic_remaining": 5368709120,
    "usage_percent": 50,
    "traffic_used_text": "5 GB",
    "traffic_limit_text": "10 GB",
    "traffic_remaining_text": "5 GB"
  }
}
```

## 15. 当前用户订阅信息

### `GET /api/internal/telegram/user/subscription`

### 用途

用于 `/subscription` 命令。

### 权限

- 服务间鉴权
- 业务侧需校验用户身份

### 查询参数

- `chat_id`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "enabled": 1,
    "expire_at": 1773000000,
    "universal_subscription_url": "https://example.com/api/user/sub/token",
    "clash_subscription_url": "https://example.com/api/user/sub/token?clash=1"
  }
}
```

## 16. 当前用户节点摘要

### `GET /api/internal/telegram/user/nodes`

### 用途

用于 `/nodes` 命令。

### 权限

- 服务间鉴权
- 业务侧需校验用户身份

### 查询参数

- `chat_id`
- `limit`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "total_nodes": 23,
    "available_nodes": 20,
    "groups": [
      {
        "group_name": "香港",
        "count": 8
      },
      {
        "group_name": "日本",
        "count": 6
      }
    ],
    "sample_nodes": [
      "香港-01",
      "香港-02",
      "日本-01"
    ]
  }
}
```

## 第三阶段 API 设计

## 17. 发起修改密码请求

### `POST /api/internal/telegram/user/password/change/request`

### 用途

创建修改密码请求，并生成一次性确认流程。

### 权限

- 服务间鉴权
- 业务侧需校验用户身份

### 请求体

```json
{
  "chat_id": "123456789"
}
```

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "request_id": "pwdreq_abc123",
    "confirm_channel": "email",
    "expire_at": 1770001000
  }
}
```

### 处理逻辑

1. 校验当前 chat 对应的绑定用户。
2. 创建一次性请求记录。
3. 发送确认码到约定渠道。
4. 返回请求上下文。

## 18. 确认修改密码

### `POST /api/internal/telegram/user/password/change/confirm`

### 用途

完成密码修改。

### 权限

- 服务间鉴权
- 业务侧需校验用户身份

### 请求体

```json
{
  "chat_id": "123456789",
  "request_id": "pwdreq_abc123",
  "confirm_code": "123456",
  "new_password": "NewPass123456"
}
```

### 成功返回

```json
{
  "code": 0,
  "message": "密码修改成功",
  "data": {
    "changed": true
  }
}
```

### 必做校验

1. 请求是否存在。
2. 请求是否过期。
3. 确认码是否正确。
4. 新密码是否满足复杂度要求。
5. 是否命中限流。
6. 写审计日志。

## 19. 重新生成订阅

### `POST /api/internal/telegram/user/subscription/regenerate`

### 用途

触发订阅重生成或刷新。

### 权限

- 服务间鉴权
- 业务侧需校验用户身份

### 请求体

```json
{
  "chat_id": "123456789"
}
```

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "generated": true,
    "universal_subscription_url": "https://example.com/api/user/sub/newtoken",
    "clash_subscription_url": "https://example.com/api/user/sub/newtoken?clash=1"
  }
}
```

## 20. 管理员触发单台服务器重检

### `POST /api/internal/telegram/admin/servers/:serverId/recheck`

### 用途

管理员在 Telegram 中手动触发某台服务器重检。

### 权限

- 服务间鉴权
- 业务侧需校验管理员身份

### 路径参数

- `serverId`

### 请求体

```json
{
  "chat_id": "123456789"
}
```

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "queued": true,
    "server_id": 1
  }
}
```

## 21. 查询提醒配置

### `GET /api/internal/telegram/user/reminders`

### 用途

查询当前用户提醒配置。

### 权限

- 服务间鉴权
- 业务侧需校验用户身份

### 查询参数

- `chat_id`

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "expire_reminder_enabled": true,
    "expire_reminder_days": 3,
    "traffic_reminder_enabled": true,
    "traffic_reminder_threshold_percent": 80
  }
}
```

## 22. 更新提醒配置

### `PUT /api/internal/telegram/user/reminders`

### 用途

更新当前用户提醒配置。

### 权限

- 服务间鉴权
- 业务侧需校验用户身份

### 请求体

```json
{
  "chat_id": "123456789",
  "expire_reminder_enabled": true,
  "expire_reminder_days": 3,
  "traffic_reminder_enabled": true,
  "traffic_reminder_threshold_percent": 80
}
```

### 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "updated": true
  }
}
```

## 错误码建议

建议为内部 Telegram API 预留独立错误码段。

示例：

- `7101` 绑定码无效
- `7102` 绑定码已过期
- `7103` chat 未绑定
- `7104` 无管理员权限
- `7105` 无用户权限
- `7106` 告警记录不存在
- `7107` 确认码无效
- `7108` 敏感操作已限流
- `7109` 订阅重生成失败

## 阶段化交付建议

## 第一阶段最小 API 集

必须先交付：

1. `GET /api/internal/telegram/health`
2. `POST /api/internal/telegram/admin/bind/verify`
3. `GET /api/internal/telegram/admin/by-chat/:chatId`
4. `GET /api/internal/telegram/servers/health`
5. `GET /api/internal/telegram/servers/health/:serverId`
6. `GET /api/internal/telegram/alerts`
7. `GET /api/internal/telegram/alerts/pending`
8. `POST /api/internal/telegram/alerts/:alertId/sent`
9. `GET /api/internal/telegram/admin/users/lookup`

## 第二阶段新增 API 集

在第一阶段基础上新增：

1. `POST /api/internal/telegram/user/bind/verify`
2. `GET /api/internal/telegram/user/by-chat/:chatId`
3. `POST /api/internal/telegram/user/unbind`
4. `GET /api/internal/telegram/user/me`
5. `GET /api/internal/telegram/user/usage`
6. `GET /api/internal/telegram/user/subscription`
7. `GET /api/internal/telegram/user/nodes`

## 第三阶段新增 API 集

最后新增：

1. `POST /api/internal/telegram/user/password/change/request`
2. `POST /api/internal/telegram/user/password/change/confirm`
3. `POST /api/internal/telegram/user/subscription/regenerate`
4. `POST /api/internal/telegram/admin/servers/:serverId/recheck`
5. `GET /api/internal/telegram/user/reminders`
6. `PUT /api/internal/telegram/user/reminders`

## 测试建议

### 第一阶段

重点验证：

- 服务间签名鉴权
- 管理员绑定
- 告警拉取与回执幂等
- 管理员权限校验
- 服务器状态查询输出正确

### 第二阶段

重点验证：

- 用户绑定
- chat 身份识别
- 只能查询本人数据
- 节点摘要返回长度控制

### 第三阶段

重点验证：

- 二次确认
- 限流
- 审计日志
- 写操作失败回滚

## 总结

这组 API 的设计原则是：

1. 机器人独立部署，但业务逻辑不分裂。
2. 主业务服务通过内部 API 暴露能力。
3. 第一阶段只做管理员告警与只读查询。
4. 第二阶段开放用户自助查询。
5. 第三阶段才开放敏感写操作。

按这个顺序推进，可以在不暴露管理端页面的前提下，把 Telegram 机器人平稳接入到当前系统架构中。
