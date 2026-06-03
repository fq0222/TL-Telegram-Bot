# TL-Telegram-Bot

Telegram Bot Phase 1 的实现计划与设计说明已写入仓库文档，当前按 `Node.js + Express` 后端、`Vue 3 + Vite` 前端、根 `npm workspaces` 的结构推进。

## 文档入口

- 设计说明：`docs/superpowers/specs/2026-06-03-telegram-phase1-bot-design.md`
- 实现计划：`docs/superpowers/plans/2026-06-03-telegram-phase1-bot.md`
- 内部接口草案：`docs/telegram-phase1-bot-api.md`

## 当前脚手架约定

- 根目录使用 `npm workspaces` 管理 `server` 与 `web`
- `server` 为 CommonJS Node 服务端应用
- `web` 为 Vite 管理的 Vue 3 前端应用
- `.env.example` 提供首轮本地配置模板

## 常用命令

```bash
npm run check
npm run dev:server
npm run dev:web
npm run build
```
