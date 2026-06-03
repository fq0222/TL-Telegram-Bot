/**
 * 概述：封装证书扫描与复制所需的最小文件系统能力，统一目录读取、存在性检查、目录创建和文件复制接口。
 */
const fs = require('node:fs/promises');
const { createLogger } = require('../utils/logger');

const logger = createLogger('FilesystemService');

/**
 * 创建文件系统服务。
 * @param {{ fsModule?: typeof import('node:fs/promises') }} [options] - 允许注入文件系统实现，便于测试和替换运行环境。
 * @returns {{ listDirectories: Function, exists: Function, ensureDir: Function, copyFile: Function }} 文件系统服务接口。
 */
function createFilesystemService({ fsModule = fs } = {}) {
  /**
   * 列出指定目录下的一级子目录名称。
   * 核心分支语义：仅返回目录项，忽略普通文件，避免证书扫描把非域名文件误识别为候选目录。
   * @param {string} basePath - 需要扫描的基础目录。
   * @returns {Promise<string[]>} 一级子目录名称列表。
   */
  async function listDirectories(basePath) {
    logger.info(`开始扫描子目录：${basePath}`);
    const entries = await fsModule.readdir(basePath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  }

  /**
   * 检查目标路径是否存在。
   * 核心分支语义：文件存在返回 true；若为 ENOENT 则返回 false，其它异常继续抛出，避免吞掉权限等真实故障。
   * @param {string} targetPath - 待检查路径。
   * @returns {Promise<boolean>} 是否存在。
   */
  async function exists(targetPath) {
    try {
      await fsModule.access(targetPath);
      return true;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return false;
      }

      throw error;
    }
  }

  /**
   * 确保目录存在，不存在时递归创建。
   * @param {string} targetPath - 需要确保存在的目录路径。
   * @returns {Promise<void>} 创建完成后返回。
   */
  async function ensureDir(targetPath) {
    logger.info(`确保目录存在：${targetPath}`);
    await fsModule.mkdir(targetPath, { recursive: true });
  }

  /**
   * 复制文件到目标路径。
   * @param {string} from - 源文件路径。
   * @param {string} to - 目标文件路径。
   * @returns {Promise<void>} 复制完成后返回。
   */
  async function copyFile(from, to) {
    logger.info(`复制文件：${from} -> ${to}`);
    await fsModule.copyFile(from, to);
  }

  /**
   * 解析路径真实位置，用于识别符号链接跳转后的最终路径。
   * 核心分支语义：默认将底层 realpath 异常继续抛出，由上层根据调用时机决定是视为风险还是缺失，避免静默忽略链接逃逸。
   * @param {string} targetPath - 需要解析真实路径的目标路径。
   * @returns {Promise<string>} 解析后的真实路径。
   */
  async function resolveRealPath(targetPath) {
    logger.info(`解析真实路径：${targetPath}`);
    return fsModule.realpath(targetPath);
  }

  return {
    listDirectories,
    exists,
    ensureDir,
    copyFile,
    resolveRealPath
  };
}

module.exports = {
  createFilesystemService
};
