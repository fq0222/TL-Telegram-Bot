-- 概述：初始化 Telegram Bot 管理端所需的 SQLite 基础表，覆盖系统配置、管理员会话和操作日志三类最小存储。

CREATE TABLE IF NOT EXISTS system_configs (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  session_status TEXT NOT NULL DEFAULT 'active',
  payload_json TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
