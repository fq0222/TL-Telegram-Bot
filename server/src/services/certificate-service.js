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
const ACME_DIRECTORY_SUFFIXES = ['', '_ecc', '_rsa'];

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
   * 校验真实路径，若目标文件尚不存在则回退为字符串路径校验。
   * 核心分支语义：仅对“待创建的目标文件”容忍 ENOENT，避免复制前因 realpath 无法解析空文件而误判失败。
   * @param {string} rootPath - 允许访问的根目录。
   * @param {string} candidatePath - 待校验路径。
   * @param {string} label - 用于日志和报错的路径标签。
   * @returns {Promise<string>} 校验通过后的路径。
   */
  async function assertRealPathWithinRootOrAllowMissing(rootPath, candidatePath, label) {
    try {
      return await assertRealPathWithinRoot(rootPath, candidatePath, label);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return assertPathWithinRoot(rootPath, candidatePath, label);
      }

      throw error;
    }
  }

  /**
   * 规范化并校验域名输入。
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
   * 将 ACME 目录名转换为域名。
   * 核心分支语义：优先兼容 acme.sh 常见的 `_ecc` 与 `_rsa` 后缀目录名。
   * @param {string} directoryName - ACME 目录名。
   * @returns {string} 规范化后的域名。
   */
  function mapDirectoryNameToDomain(directoryName) {
    if (directoryName.endsWith('_ecc')) {
      return directoryName.slice(0, -4);
    }

    if (directoryName.endsWith('_rsa')) {
      return directoryName.slice(0, -4);
    }

    return directoryName;
  }

  /**
   * 构建域名在 ACME 目录中的候选子目录列表。
   * @param {string} domain - 规范化后的域名。
   * @returns {string[]} 候选目录名列表。
   */
  function buildSourceDirectoryCandidates(domain) {
    return ACME_DIRECTORY_SUFFIXES.map((suffix) => `${domain}${suffix}`);
  }

  /**
   * 构建目标 TLS 证书路径。
   * @param {string} domain - 规范化后的域名。
   * @returns {{
   *   targetDirectory: string,
   *   targetFullchainPath: string,
   *   targetPrivkeyPath: string
   * }} 目标路径集合。
   */
  function buildTargetPaths(domain) {
    const targetDirectory = assertPathWithinRoot(
      normalizedTlsRootPath,
      posixPath.join(normalizedTlsRootPath, domain),
      'certificate target'
    );

    return {
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
   * 构建某个源目录下可兼容的证书文件候选组合。
   * 核心分支语义：同时兼容旧版 `fullchain.pem + privkey.pem` 和 acme.sh 的 `fullchain.cer + 域名.key`。
   * @param {string} sourceDirectory - 已校验的 ACME 证书目录。
   * @param {string} domain - 规范化后的域名。
   * @returns {Array<{ sourceFullchainPath: string, sourcePrivkeyPath: string }>} 候选证书文件组合。
   */
  function buildSourceFileCandidates(sourceDirectory, domain) {
    return [
      {
        sourceFullchainPath: assertPathWithinRoot(
          normalizedAcmeBasePath,
          posixPath.join(sourceDirectory, 'fullchain.pem'),
          'certificate source'
        ),
        sourcePrivkeyPath: assertPathWithinRoot(
          normalizedAcmeBasePath,
          posixPath.join(sourceDirectory, 'privkey.pem'),
          'certificate source'
        )
      },
      {
        sourceFullchainPath: assertPathWithinRoot(
          normalizedAcmeBasePath,
          posixPath.join(sourceDirectory, 'fullchain.cer'),
          'certificate source'
        ),
        sourcePrivkeyPath: assertPathWithinRoot(
          normalizedAcmeBasePath,
          posixPath.join(sourceDirectory, `${domain}.key`),
          'certificate source'
        )
      }
    ];
  }

  /**
   * 在 ACME 根目录下解析域名对应的可用源证书路径。
   * 核心分支语义：按目录后缀优先级依次尝试，找到首组完整证书后立即返回。
   * @param {string} domain - 规范化后的域名。
   * @returns {Promise<null | {
   *   sourceDirectory: string,
   *   sourceFullchainPath: string,
   *   sourcePrivkeyPath: string
   * }>} 可用证书路径；未找到时返回 null。
   */
  async function resolveSourcePaths(domain) {
    const candidateDirectories = buildSourceDirectoryCandidates(domain);

    for (const directoryName of candidateDirectories) {
      const sourceDirectory = assertPathWithinRoot(
        normalizedAcmeBasePath,
        posixPath.join(normalizedAcmeBasePath, directoryName),
        'certificate source'
      );
      const fileCandidates = buildSourceFileCandidates(sourceDirectory, domain);

      for (const fileCandidate of fileCandidates) {
        const [hasFullchain, hasPrivkey] = await Promise.all([
          filesystemService.exists(fileCandidate.sourceFullchainPath),
          filesystemService.exists(fileCandidate.sourcePrivkeyPath)
        ]);

        if (hasFullchain && hasPrivkey) {
          return {
            sourceDirectory,
            sourceFullchainPath: fileCandidate.sourceFullchainPath,
            sourcePrivkeyPath: fileCandidate.sourcePrivkeyPath
          };
        }
      }
    }

    return null;
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
   * @param {string} targetDirectory - 待校验目标目录。
   * @returns {Promise<void>} 校验通过后返回。
   */
  async function assertTargetDirectorySafe(targetDirectory) {
    await assertRealPathWithinRoot(normalizedTlsRootPath, targetDirectory, 'certificate target');
  }

  /**
   * 校验目标证书文件真实路径安全性。
   * @param {{ targetFullchainPath: string, targetPrivkeyPath: string }} paths - 待校验目标文件路径集合。
   * @returns {Promise<void>} 校验通过后返回。
   */
  async function assertTargetFilePathsSafe(paths) {
    await assertRealPathWithinRootOrAllowMissing(
      normalizedTlsRootPath,
      paths.targetFullchainPath,
      'certificate target'
    );
    await assertRealPathWithinRootOrAllowMissing(
      normalizedTlsRootPath,
      paths.targetPrivkeyPath,
      'certificate target'
    );
  }

  /**
   * 扫描可用域名。
   * 核心分支语义：兼容 acme.sh 的 `_ecc/_rsa` 目录，并对同一域名去重。
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
    const seenDomains = new Set();

    for (const directory of directories) {
      const domain = mapDirectoryNameToDomain(directory);

      if (seenDomains.has(domain)) {
        continue;
      }

      if (await resolveSourcePaths(domain)) {
        domains.push(domain);
        seenDomains.add(domain);
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
    const sourcePaths = await resolveSourcePaths(normalizedDomain);
    const { targetDirectory, targetFullchainPath, targetPrivkeyPath } = buildTargetPaths(normalizedDomain);

    logger.info(`开始激活域名证书：${normalizedDomain}`);

    if (!sourcePaths) {
      logger.error(`激活域名证书失败，源证书缺失：${normalizedDomain}`);
      throw new Error(`Certificate files are incomplete for domain: ${normalizedDomain}`);
    }

    await assertSourcePathsSafe(sourcePaths);
    await filesystemService.ensureDir(targetDirectory);
    await assertTargetDirectorySafe(targetDirectory);
    await assertTargetFilePathsSafe({
      targetFullchainPath,
      targetPrivkeyPath
    });
    await filesystemService.copyFile(sourcePaths.sourceFullchainPath, targetFullchainPath);
    await filesystemService.copyFile(sourcePaths.sourcePrivkeyPath, targetPrivkeyPath);

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
