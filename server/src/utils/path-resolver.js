/**
 * 概述：统一处理服务内部使用的路径展开逻辑，当前主要负责将 "~" 形式路径解析为用户主目录绝对路径。
 */
const os = require('node:os');
const path = require('node:path');

/**
 * 创建路径解析工具。
 * @param {{ homeDir?: string, pathModule?: typeof import('node:path') }} [options] - 允许注入主目录和路径模块，便于测试或跨环境复用。
 * @returns {{ resolvePath: (inputPath: string) => string }} 路径解析接口。
 */
function createPathResolver({ homeDir = os.homedir(), pathModule = path } = {}) {
  /**
   * 解析包含 "~" 前缀的路径。
   * 核心分支语义：仅当路径以 "~" 或 "~/"、"~\\" 开头时展开主目录，其余路径保持原样，避免误改绝对路径与相对路径。
   * @param {string} inputPath - 需要解析的原始路径。
   * @returns {string} 解析后的绝对路径或原始路径。
   */
  function resolvePath(inputPath) {
    if (typeof inputPath !== 'string' || inputPath.trim() === '') {
      throw new Error('Path is required');
    }

    if (inputPath === '~') {
      return homeDir;
    }

    if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
      return pathModule.join(homeDir, inputPath.slice(2));
    }

    return inputPath;
  }

  return {
    resolvePath
  };
}

module.exports = {
  createPathResolver
};
