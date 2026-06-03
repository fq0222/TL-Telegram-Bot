/**
 * 概述：封装 operation_logs 表的最小写入与查询能力，为管理员操作审计提供统一持久化入口。
 */
const { createLogger } = require('../utils/logger');

const logger = createLogger('OperationLogRepository');

/**
 * 创建操作日志仓储。
 * @param {{ prepare: Function }} options.database - SQLite 数据库实例，需支持 prepare 以执行参数化 SQL。
 * @returns {{ createLog: Function, listLogs: Function }} 操作日志仓储接口。
 */
function createOperationLogRepository({ database }) {
  if (!database || typeof database.prepare !== 'function') {
    throw new Error('OperationLogRepository requires a database with prepare()');
  }

  /**
   * 写入单条操作日志。
   * 核心分支：target 与 detail 可为空，保证记录最小操作上下文时也能落库。
   * @param {{ operatorId?: string|null, action: string, targetType?: string|null, targetId?: string|null, detailJson?: string|null }} log - 待写入日志。
   * @returns {Promise<{ id: number, operatorId: string|null, action: string, targetType: string|null, targetId: string|null, detailJson: string|null, createdAt: string }>} 已落库日志。
   */
  async function createLog(log) {
    logger.info(`写入操作日志：${log.action}`);

    const statement = database.prepare(`
      INSERT INTO operation_logs (operator_id, action, target_type, target_id, detail_json)
      VALUES (?, ?, ?, ?, ?)
      RETURNING
        id,
        operator_id AS operatorId,
        action,
        target_type AS targetType,
        target_id AS targetId,
        detail_json AS detailJson,
        created_at AS createdAt
    `);

    return statement.get(
      log.operatorId || null,
      log.action,
      log.targetType || null,
      log.targetId || null,
      log.detailJson || null
    );
  }

  /**
   * 按数量倒序读取操作日志。
   * 核心分支：未传 limit 时使用 50 条默认值，避免后台首次接入时出现无限制查询。
   * @param {number} [limit=50] - 最大返回条数。
   * @returns {Promise<Array<{ id: number, operatorId: string|null, action: string, targetType: string|null, targetId: string|null, detailJson: string|null, createdAt: string }>>} 日志列表。
   */
  async function listLogs(limit = 50) {
    logger.info(`查询操作日志列表，条数限制：${limit}`);

    const statement = database.prepare(`
      SELECT
        id,
        operator_id AS operatorId,
        action,
        target_type AS targetType,
        target_id AS targetId,
        detail_json AS detailJson,
        created_at AS createdAt
      FROM operation_logs
      ORDER BY id DESC
      LIMIT ?
    `);

    return statement.all(limit);
  }

  return {
    createLog,
    listLogs
  };
}

module.exports = {
  createOperationLogRepository
};
