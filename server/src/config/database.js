/**
 * 概述：提供 SQLite 数据库初始化入口，负责创建数据库目录、加载初始化 SQL，并返回可供仓储复用的数据库实例。
 */
const fs = require('node:fs');
const path = require('node:path');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Database');

/**
 * 按需加载 Node.js 内置 SQLite 驱动。
 * 核心分支：允许注入 sqliteModule 或自定义 moduleLoader，便于测试和后续替换底层实现。
 * 核心分支：仅在真正创建数据库连接时加载驱动，避免未使用数据库能力时影响基础测试。
 * @param {{ sqliteModule?: object, moduleLoader?: Function }} [options] - SQLite 模块加载参数。
 * @returns {{ DatabaseSync: new (filename: string) => { exec: Function, close: Function } }} SQLite 驱动导出对象。
 */
function loadSqliteModule(options = {}) {
  if (options.sqliteModule) {
    return options.sqliteModule;
  }

  const moduleLoader = options.moduleLoader || ((moduleName) => require(moduleName));

  try {
    return moduleLoader('node:sqlite');
  } catch (error) {
    throw new Error(
      `Failed to load SQLite module "node:sqlite". ${error && error.message ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * 读取初始化 SQL 内容。
 * @param {string} sqlFilePath - 初始化 SQL 文件绝对路径，用于执行建表语句。
 * @param {typeof import('node:fs')} [fsModule=fs] - 文件系统实现，便于测试注入。
 * @returns {string} SQL 文本内容。
 */
function loadInitSql(sqlFilePath, fsModule = fs) {
  logger.info(`加载数据库初始化脚本：${sqlFilePath}`);
  return fsModule.readFileSync(sqlFilePath, 'utf8');
}

/**
 * 初始化数据库结构。
 * @param {{ exec: Function }} database - 已创建的 SQLite 数据库实例，需支持 exec 方法。
 * @param {string} initSql - 建表 SQL 文本。
 */
function initializeDatabase(database, initSql) {
  logger.info('开始执行数据库初始化 SQL');
  database.exec(initSql);
  logger.info('数据库初始化 SQL 执行完成');
}

/**
 * 创建并初始化 SQLite 数据库实例。
 * @param {{ filename?: string, initSqlPath?: string, sqliteModule?: object, moduleLoader?: Function, databaseFactory?: Function, fsModule?: typeof import('node:fs') }} [options] - 数据库创建参数；可覆盖默认库文件、初始化脚本路径、SQLite 加载器和数据库构造逻辑。
 * @returns {{ exec: Function, close: Function }} 可供仓储复用的 SQLite 数据库实例。
 */
function createDatabase(options = {}) {
  const fsModule = options.fsModule || fs;
  const filename = options.filename || path.resolve(__dirname, '../../data/app.sqlite');
  const initSqlPath = options.initSqlPath || path.resolve(__dirname, '../storage/init.sql');
  const sqliteModule = loadSqliteModule({
    sqliteModule: options.sqliteModule,
    moduleLoader: options.moduleLoader
  });
  const databaseFactory =
    options.databaseFactory ||
    ((resolvedFilename, loadedSqliteModule) => new loadedSqliteModule.DatabaseSync(resolvedFilename));

  fsModule.mkdirSync(path.dirname(filename), { recursive: true });
  logger.info(`创建 SQLite 数据库连接：${filename}`);

  const database = databaseFactory(filename, sqliteModule);
  const initSql = loadInitSql(initSqlPath, fsModule);

  initializeDatabase(database, initSql);

  return database;
}

module.exports = {
  createDatabase,
  initializeDatabase,
  loadInitSql,
  loadSqliteModule
};
