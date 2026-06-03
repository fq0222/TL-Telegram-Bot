/**
 * 概述：封装 admin_sessions 表的最小会话存取能力，为后续管理员登录态持久化预留统一入口。
 */
const { createLogger } = require('../utils/logger');

const logger = createLogger('SessionRepository');

/**
 * 创建管理员会话仓储。
 * @param {{ prepare: Function }} options.database - SQLite 数据库实例，需支持 prepare 以执行参数化 SQL。
 * @returns {{ saveSession: Function, getSession: Function }} 会话仓储接口。
 */
function createSessionRepository({ database }) {
  if (!database || typeof database.prepare !== 'function') {
    throw new Error('SessionRepository requires a database with prepare()');
  }

  /**
   * 保存管理员会话。
   * 核心分支：同一 session_id 再次写入时覆盖状态、载荷和过期时间，便于刷新登录态。
   * @param {{ sessionId: string, adminId: string, status?: string, payloadJson?: string|null, expiresAt?: string|null }} session - 待保存会话。
   * @returns {Promise<{ sessionId: string, adminId: string, status: string, payloadJson: string|null, expiresAt: string|null, updatedAt: string }>} 已保存会话。
   */
  async function saveSession(session) {
    logger.info(`保存管理员会话：${session.sessionId}`);

    const statement = database.prepare(`
      INSERT INTO admin_sessions (session_id, admin_id, session_status, payload_json, expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(session_id) DO UPDATE SET
        admin_id = excluded.admin_id,
        session_status = excluded.session_status,
        payload_json = excluded.payload_json,
        expires_at = excluded.expires_at,
        updated_at = datetime('now', 'localtime')
      RETURNING
        session_id AS sessionId,
        admin_id AS adminId,
        session_status AS status,
        payload_json AS payloadJson,
        expires_at AS expiresAt,
        updated_at AS updatedAt
    `);

    return statement.get(
      session.sessionId,
      session.adminId,
      session.status || 'active',
      session.payloadJson || null,
      session.expiresAt || null
    );
  }

  /**
   * 按会话 ID 读取管理员会话。
   * 核心分支：未查询到会话时返回 null，交由上层决定是否要求重新登录。
   * @param {string} sessionId - 管理员会话标识。
   * @returns {Promise<{ sessionId: string, adminId: string, status: string, payloadJson: string|null, expiresAt: string|null, updatedAt: string } | null>} 会话记录或空值。
   */
  async function getSession(sessionId) {
    logger.info(`读取管理员会话：${sessionId}`);

    const statement = database.prepare(`
      SELECT
        session_id AS sessionId,
        admin_id AS adminId,
        session_status AS status,
        payload_json AS payloadJson,
        expires_at AS expiresAt,
        updated_at AS updatedAt
      FROM admin_sessions
      WHERE session_id = ?
    `);

    return statement.get(sessionId) || null;
  }

  return {
    saveSession,
    getSession
  };
}

module.exports = {
  createSessionRepository
};
