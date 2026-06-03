/**
 * 概述：负责扫描 ACME 证书目录并激活指定域名证书，将可用证书复制到机器人 HTTPS 启动目录。
 */
const path = require('node:path');
const { createLogger } = require('../utils/logger');
const { createFilesystemService } = require('./filesystem-service');
const { createPathResolver } = require('../utils/path-resolver');

const logger = createLogger('CertificateService');
const posixPath = path.posix;
const DEFAULT_ACME_PATH = '~/.acme.sh';
const DEFAULT_TLS_ROOT = '/root/tlboot';

/**
 * 创建证书服务。
 * @param {{
 *   filesystemService?: {
 *     listDirectories: Function,
 *     exists: Function,
 *     ensureDir: Function,
 *     copyFile: Function,
 *     resolveRealPath?: Function
 *   },
 *   pathResolver?: { resolvePath: Function },
 *   acmeBasePath?: string,
 *   tlsRootPath?: string
 * }} [options] - 允许注入文件系统服务、路径解析器和目录配置，便于测试与部署适配。
 * @returns {{ listDomains: Function, activateDomain: Function }} 证书服务接口。
 */
function createCertificateService({
  filesystemService = createFilesystemService(),
  pathResolver = createPathResolver(),
  acmeBasePath = DEFAULT_ACME_PATH,
  tlsRootPath = DEFAULT_TLS_ROOT
} = {}) {
  const resolvedAcmeBasePath = pathResolver.resolvePath(acmeBasePath);
  const normalizedAcmeBasePath = posixPath.resolve(resolvedAcmeBasePath);
  const normalizedTlsRootPath = posixPath.resolve(tlsRootPath);

  /**
   * 校验路径字符串在规范化后是否仍位于允许根目录内。
   * 核心分支语义：候选路径必须等于根目录，或以“根目录/”为前缀，否则视为路径越界。
   * @param {string} rootPath - 允许访问的根目录。
   * @param {string} candidatePath - 待校验路径。
   * @param {string} label - 用于日志和报错的路径标签。
   * @returns {string} 规范化后的安全路径。
   */
  function assertPathWithinRoot(rootPath, candidatePath, label) {
    const normalizedRootPath = posixPath.resolve(rootPath);
    const normalizedCandidatePath = posixPath.resolve(candidatePath);

    if (
      normalizedCandidatePath !== normalizedRootPath &&
      !normalizedCandidatePath.startsWith(`${normalizedRootPath}/`)
    ) {
      logger.error(`${label} 路径越界：${normalizedCandidatePath}`);
      throw new Error(`Resolved ${label} path is outside allowed root`);
    }

    return normalizedCandidatePath;
  }

  /**
   * 校验真实路径解析后是否仍位于允许根目录内。
   * 核心分支语义：若 realpath 解析结果越界，则说明存在符号链接或挂载跳转风险，应立即中止复制。
   * @param {string} rootPath - 允许访问的根目录。
   * @param {string} candidatePath - 待解析真实路径的候选路径。
   * @param {string} label - 用于日志和报错的路径标签。
   * @returns {Promise<string>} 校验通过后的真实路径。
   */
  async function assertRealPathWithinRoot(rootPath, candidatePath, label) {
    if (typeof filesystemService.resolveRealPath !== 'function') {
      return assertPathWithinRoot(rootPath, candidatePath, label);
    }

    const resolvedRealPath = await filesystemService.resolveRealPath(candidatePath);
    return assertPathWithinRoot(rootPath, resolvedRealPath, label);
  }

  /**
   * 构建域名对应的源证书路径与目标证书路径。
   * @param {string} domain - 已通过校验的域名目录名。
   * @returns {{
   *   sourceDirectory: string,
   *   sourceFullchainPath: string,
   *   sourcePrivkeyPath: string,
   *   targetDirectory: string,
   *   targetFullchainPath: string,
   *   targetPrivkeyPath: string
   * }} 路径集合。
   */
  function buildDomainPaths(domain) {
    const sourceDirectory = assertPathWithinRoot(
      normalizedAcmeBasePath,
      posixPath.join(normalizedAcmeBasePath, domain),
      'certificate source'
    );
    const targetDirectory = assertPathWithinRoot(
      normalizedTlsRootPath,
      posixPath.join(normalizedTlsRootPath, domain),
      'certificate target'
    );

    return {
      sourceDirectory,
      sourceFullchainPath: assertPathWithinRoot(
        normalizedAcmeBasePath,
        posixPath.join(sourceDirectory, 'fullchain.pem'),
        'certificate source'
      ),
      sourcePrivkeyPath: assertPathWithinRoot(
        normalizedAcmeBasePath,
        posixPath.join(sourceDirectory, 'privkey.pem'),
        'certificate source'
      ),
      targetDirectory,
      targetFullchainPath: assertPathWithinRoot(
        normalizedTlsRootPath,
        posixPath.join(targetDirectory, 'fullchain.pem'),
        'certificate target'
      ),
      targetPrivkeyPath: assertPathWithinRoot(
        normalizedTlsRootPath,
        posixPath.join(targetDirectory, 'privkey.pem'),
        'certificate target'
      )
    };
  }

  /**
   * 规范化并校验域名输入。
   * 核心分支语义：除空白值外，还拒绝路径分隔符、连续点、前导点和空段，避免目录逃逸。
   * @param {string} domain - 待校验域名。
   * @returns {string} 规范化后的域名。
   */
  function normalizeDomain(domain) {
    if (typeof domain !== 'string' || domain.trim() === '') {
      throw new Error('Domain is required');
    }

    const normalizedDomain = domain.trim();
    const segments = normalizedDomain.split('.');

    if (
      normalizedDomain.includes('/') ||
      normalizedDomain.includes('\\') ||
      normalizedDomain.includes('..') ||
      normalizedDomain.startsWith('.') ||
      segments.some((segment) => segment.trim() === '')
    ) {
      logger.error(`域名非法，拒绝激活证书：${normalizedDomain}`);
      throw new Error(`Invalid domain: ${normalizedDomain}`);
    }

    return normalizedDomain;
  }

  /**
   * 判断域名目录是否同时具备完整证书和私钥。
   * @param {string} domain - 域名目录名。
   * @returns {Promise<boolean>} 是否具备双证书文件。
   */
  async function hasRequiredCertificates(domain) {
    const { sourceFullchainPath, sourcePrivkeyPath } = buildDomainPaths(domain);
    const [hasFullchain, hasPrivkey] = await Promise.all([
      filesystemService.exists(sourceFullchainPath),
      filesystemService.exists(sourcePrivkeyPath)
    ]);

    return hasFullchain && hasPrivkey;
  }

  /**
   * 校验源目录和源证书真实路径安全性。
   * @param {{ sourceDirectory: string, sourceFullchainPath: string, sourcePrivkeyPath: string }} paths - 待校验源路径集合。
   * @returns {Promise<void>} 校验通过后返回。
   */
  async function assertSourcePathsSafe(paths) {
    await assertRealPathWithinRoot(normalizedAcmeBasePath, paths.sourceDirectory, 'certificate source');
    await assertRealPathWithinRoot(normalizedAcmeBasePath, paths.sourceFullchainPath, 'certificate source');
    await assertRealPathWithinRoot(normalizedAcmeBasePath, paths.sourcePrivkeyPath, 'certificate source');
  }

  /**
   * 校验目标目录真实路径安全性。
   * 核心分支语义：目录创建后立即校验 realpath，及时识别 `/root/tlboot/<domain>` 或其祖先链路中的符号链接跳转。
   * @param {string} targetDirectory - 待校验目标目录。
   * @returns {Promise<void>} 校验通过后返回。
   */
  async function assertTargetDirectorySafe(targetDirectory) {
    await assertRealPathWithinRoot(normalizedTlsRootPath, targetDirectory, 'certificate target');
  }

  /**
   * 校验目标证书文件真实路径安全性。
   * 核心分支语义：即使目标目录安全，也要逐个确认目标文件未通过既有符号链接指向根目录外，无法确认时拒绝复制。
   * @param {{ targetFullchainPath: string, targetPrivkeyPath: string }} paths - 待校验目标文件路径集合。
   * @returns {Promise<void>} 校验通过后返回。
   */
  async function assertTargetFilePathsSafe(paths) {
    await assertRealPathWithinRoot(normalizedTlsRootPath, paths.targetFullchainPath, 'certificate target');
    await assertRealPathWithinRoot(normalizedTlsRootPath, paths.targetPrivkeyPath, 'certificate target');
  }

  /**
   * 扫描可用域名。
   * 核心分支语义：仅返回同时存在 `fullchain.pem` 与 `privkey.pem` 的一级目录。
   * @returns {Promise<string[]>} 可用域名列表。
   */
  async function listDomains() {
    logger.info(`开始扫描证书目录：${resolvedAcmeBasePath}`);
    let directories = [];

    try {
      directories = await filesystemService.listDirectories(resolvedAcmeBasePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        logger.warn(`证书目录不存在或尚未创建，返回空域名列表：${resolvedAcmeBasePath}`);
        return [];
      }

      throw error;
    }

    const domains = [];

    for (const directory of directories) {
      if (await hasRequiredCertificates(directory)) {
        domains.push(directory);
      }
    }

    logger.info(`证书扫描完成，可用域名数量：${domains.length}`);
    return domains;
  }

  /**
   * 激活指定域名证书。
   * 核心分支语义：源证书缺失或真实路径越界时立即报错；仅在安全校验通过后创建目录并复制证书。
   * @param {string} domain - 待激活域名。
   * @returns {Promise<{ domain: string, fullchainPath: string, privkeyPath: string }>} 激活后的目标路径信息。
   */
  async function activateDomain(domain) {
    const normalizedDomain = normalizeDomain(domain);
    const {
      sourceDirectory,
      sourceFullchainPath,
      sourcePrivkeyPath,
      targetDirectory,
      targetFullchainPath,
      targetPrivkeyPath
    } = buildDomainPaths(normalizedDomain);

    logger.info(`开始激活域名证书：${normalizedDomain}`);

    if (!(await hasRequiredCertificates(normalizedDomain))) {
      logger.error(`激活域名证书失败，源证书缺失：${normalizedDomain}`);
      throw new Error(`Certificate files are incomplete for domain: ${normalizedDomain}`);
    }

    await assertSourcePathsSafe({
      sourceDirectory,
      sourceFullchainPath,
      sourcePrivkeyPath
    });
    await filesystemService.ensureDir(targetDirectory);
    await assertTargetDirectorySafe(targetDirectory);
    await assertTargetFilePathsSafe({
      targetFullchainPath,
      targetPrivkeyPath
    });
    await filesystemService.copyFile(sourceFullchainPath, targetFullchainPath);
    await filesystemService.copyFile(sourcePrivkeyPath, targetPrivkeyPath);

    logger.info(`域名证书激活完成：${normalizedDomain}`);
    return {
      domain: normalizedDomain,
      fullchainPath: targetFullchainPath,
      privkeyPath: targetPrivkeyPath
    };
  }

  return {
    listDomains,
    activateDomain
  };
}

module.exports = {
  createCertificateService
};
