/**
 * 概述：负责判断 HTTPS 启动所需证书是否就绪，并在证书可用时加载证书内容，供服务端入口统一决定监听方式。
 */
const fs = require('fs');
const { createLogger } = require('../utils/logger');

const logger = createLogger('HttpsStateService');

/**
 * 创建 HTTPS 状态服务。
 * @param {{ fsModule?: { existsSync: Function, readFileSync: Function } }} [options] - 文件系统依赖，允许测试注入。
 * @returns {{ resolveTlsState: Function }} HTTPS 状态服务实例。
 */
function createHttpsStateService(options = {}) {
  const fsModule = options.fsModule || fs;

  /**
   * 解析当前 TLS 证书状态。
   * 核心分支语义：只要任一证书路径缺失或文件不存在，就返回未就绪状态并交由启动层降级；仅在双证书都存在时读取内容。
   * @param {{ tlsFullchainPath?: string, tlsPrivkeyPath?: string }} input - 当前待解析的 TLS 路径配置。
   * @returns {{ ready: boolean, reason: string | null, cert: Buffer | null, key: Buffer | null }} TLS 状态结果。
   */
  function resolveTlsState(input = {}) {
    const tlsFullchainPath =
      typeof input.tlsFullchainPath === 'string' ? input.tlsFullchainPath.trim() : '';
    const tlsPrivkeyPath =
      typeof input.tlsPrivkeyPath === 'string' ? input.tlsPrivkeyPath.trim() : '';

    if (!tlsFullchainPath || !tlsPrivkeyPath) {
      logger.warn('HTTPS 证书路径未配置完整，服务将进入降级监听分支');
      return {
        ready: false,
        reason: 'missing-path',
        cert: null,
        key: null
      };
    }

    if (!fsModule.existsSync(tlsFullchainPath) || !fsModule.existsSync(tlsPrivkeyPath)) {
      logger.warn('HTTPS 证书文件不存在，服务将进入降级监听分支');
      return {
        ready: false,
        reason: 'missing-file',
        cert: null,
        key: null
      };
    }

    logger.info('HTTPS 证书检查通过，准备加载证书内容');
    return {
      ready: true,
      reason: null,
      cert: fsModule.readFileSync(tlsFullchainPath),
      key: fsModule.readFileSync(tlsPrivkeyPath)
    };
  }

  return {
    resolveTlsState
  };
}

module.exports = {
  createHttpsStateService
};
