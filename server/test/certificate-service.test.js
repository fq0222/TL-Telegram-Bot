/**
 * 概述：覆盖证书服务对 ACME 目录扫描与证书激活复制的核心场景，包含传统 pem 布局与 acme.sh 目录布局。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

/**
 * 以依赖注入方式加载目标模块，避免测试依赖真实文件系统。
 * @param {string} relativeModulePath - 相对当前测试文件的模块路径。
 * @param {Record<string, unknown>} mocks - 需要替换的依赖映射。
 * @returns {unknown} 加载后的模块导出对象。
 */
function loadWithMocks(relativeModulePath, mocks) {
  const modulePath = require.resolve(relativeModulePath);
  const originalLoad = Module._load;

  delete require.cache[modulePath];
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }
}

function createSilentLoggerModule() {
  return {
    createLogger() {
      return {
        info() {},
        warn() {},
        error() {}
      };
    }
  };
}

test('createCertificateService listDomains 只返回同时具备双证书文件的域名', async () => {
  const fileState = new Set([
    '/mock/home/.acme.sh/alpha.example.com/fullchain.pem',
    '/mock/home/.acme.sh/alpha.example.com/privkey.pem',
    '/mock/home/.acme.sh/beta.example.com/fullchain.pem',
    '/mock/home/.acme.sh/gamma.example.com/privkey.pem'
  ]);
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': createSilentLoggerModule()
  });
  const service = createCertificateService({
    filesystemService: {
      async listDirectories(basePath) {
        assert.equal(basePath, '/mock/home/.acme.sh');
        return ['alpha.example.com', 'beta.example.com', 'gamma.example.com'];
      },
      async exists(targetPath) {
        return fileState.has(targetPath);
      }
    },
    pathResolver: {
      resolvePath(inputPath) {
        return inputPath === '~/.acme.sh' ? '/mock/home/.acme.sh' : inputPath;
      }
    }
  });

  const domains = await service.listDomains();

  assert.deepEqual(domains, ['alpha.example.com']);
});

test('createCertificateService listDomains 在证书目录不存在时返回空列表', async () => {
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': createSilentLoggerModule()
  });
  const service = createCertificateService({
    filesystemService: {
      async listDirectories() {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        throw error;
      },
      async exists() {
        return false;
      }
    },
    pathResolver: {
      resolvePath(inputPath) {
        return inputPath === '~/.acme.sh' ? '/mock/home/.acme.sh' : inputPath;
      }
    }
  });

  const domains = await service.listDomains();

  assert.deepEqual(domains, []);
});

test('createCertificateService listDomains 兼容 acme.sh 的 _ecc 目录与 .cer/.key 文件命名', async () => {
  const fileState = new Set([
    '/mock/home/.acme.sh/us00.bidding.dpdns.org_ecc/fullchain.cer',
    '/mock/home/.acme.sh/us00.bidding.dpdns.org_ecc/us00.bidding.dpdns.org.key',
    '/mock/home/.acme.sh/example.com_rsa/fullchain.cer',
    '/mock/home/.acme.sh/example.com_rsa/example.com.key'
  ]);
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': createSilentLoggerModule()
  });
  const service = createCertificateService({
    filesystemService: {
      async listDirectories(basePath) {
        assert.equal(basePath, '/mock/home/.acme.sh');
        return ['us00.bidding.dpdns.org_ecc', 'example.com_rsa', 'missing.example_ecc'];
      },
      async exists(targetPath) {
        return fileState.has(targetPath);
      }
    },
    pathResolver: {
      resolvePath(inputPath) {
        return inputPath === '~/.acme.sh' ? '/mock/home/.acme.sh' : inputPath;
      }
    }
  });

  const domains = await service.listDomains();

  assert.deepEqual(domains, ['us00.bidding.dpdns.org', 'example.com']);
});

test('createCertificateService activateDomain 复制证书后返回正确目标路径', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': createSilentLoggerModule()
  });
  const service = createCertificateService({
    filesystemService: {
      async exists() {
        return true;
      },
      async ensureDir(targetPath) {
        ensureDirCalls.push(targetPath);
      },
      async copyFile(from, to) {
        copyCalls.push({ from, to });
      }
    },
    pathResolver: {
      resolvePath(inputPath) {
        return inputPath === '~/.acme.sh' ? '/mock/home/.acme.sh' : inputPath;
      }
    }
  });

  const result = await service.activateDomain('alpha.example.com');

  assert.deepEqual(ensureDirCalls, ['/root/tlboot/alpha.example.com']);
  assert.deepEqual(copyCalls, [
    {
      from: '/mock/home/.acme.sh/alpha.example.com/fullchain.pem',
      to: '/root/tlboot/alpha.example.com/fullchain.pem'
    },
    {
      from: '/mock/home/.acme.sh/alpha.example.com/privkey.pem',
      to: '/root/tlboot/alpha.example.com/privkey.pem'
    }
  ]);
  assert.deepEqual(result, {
    domain: 'alpha.example.com',
    fullchainPath: '/root/tlboot/alpha.example.com/fullchain.pem',
    privkeyPath: '/root/tlboot/alpha.example.com/privkey.pem'
  });
});

test('createCertificateService activateDomain 兼容 acme.sh 的 _ecc 目录并复制为目标 pem 文件名', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': createSilentLoggerModule()
  });
  const service = createCertificateService({
    filesystemService: {
      async exists(targetPath) {
        return [
          '/mock/home/.acme.sh/us00.bidding.dpdns.org_ecc/fullchain.cer',
          '/mock/home/.acme.sh/us00.bidding.dpdns.org_ecc/us00.bidding.dpdns.org.key'
        ].includes(targetPath);
      },
      async ensureDir(targetPath) {
        ensureDirCalls.push(targetPath);
      },
      async copyFile(from, to) {
        copyCalls.push({ from, to });
      }
    },
    pathResolver: {
      resolvePath(inputPath) {
        return inputPath === '~/.acme.sh' ? '/mock/home/.acme.sh' : inputPath;
      }
    }
  });

  const result = await service.activateDomain('us00.bidding.dpdns.org');

  assert.deepEqual(ensureDirCalls, ['/root/tlboot/us00.bidding.dpdns.org']);
  assert.deepEqual(copyCalls, [
    {
      from: '/mock/home/.acme.sh/us00.bidding.dpdns.org_ecc/fullchain.cer',
      to: '/root/tlboot/us00.bidding.dpdns.org/fullchain.pem'
    },
    {
      from: '/mock/home/.acme.sh/us00.bidding.dpdns.org_ecc/us00.bidding.dpdns.org.key',
      to: '/root/tlboot/us00.bidding.dpdns.org/privkey.pem'
    }
  ]);
  assert.deepEqual(result, {
    domain: 'us00.bidding.dpdns.org',
    fullchainPath: '/root/tlboot/us00.bidding.dpdns.org/fullchain.pem',
    privkeyPath: '/root/tlboot/us00.bidding.dpdns.org/privkey.pem'
  });
});

test('createCertificateService activateDomain 遇到非法域名时应报错且不得执行复制', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': createSilentLoggerModule()
  });
  const service = createCertificateService({
    filesystemService: {
      async exists() {
        return true;
      },
      async ensureDir(targetPath) {
        ensureDirCalls.push(targetPath);
      },
      async copyFile(from, to) {
        copyCalls.push({ from, to });
      }
    },
    pathResolver: {
      resolvePath(inputPath) {
        return inputPath === '~/.acme.sh' ? '/mock/home/.acme.sh' : inputPath;
      }
    }
  });

  await assert.rejects(() => service.activateDomain('../../etc'), /invalid domain/i);
  await assert.rejects(() => service.activateDomain('a/b'), /invalid domain/i);

  assert.deepEqual(ensureDirCalls, []);
  assert.deepEqual(copyCalls, []);
});

test('createCertificateService activateDomain 源证书缺失时应报错且不得执行复制', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const existsCalls = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': createSilentLoggerModule()
  });
  const service = createCertificateService({
    filesystemService: {
      async exists(targetPath) {
        existsCalls.push(targetPath);
        return targetPath.endsWith('/fullchain.pem');
      },
      async ensureDir(targetPath) {
        ensureDirCalls.push(targetPath);
      },
      async copyFile(from, to) {
        copyCalls.push({ from, to });
      }
    },
    pathResolver: {
      resolvePath(inputPath) {
        return inputPath === '~/.acme.sh' ? '/mock/home/.acme.sh' : inputPath;
      }
    }
  });

  await assert.rejects(
    () => service.activateDomain('alpha.example.com'),
    /Certificate files are incomplete for domain: alpha\.example\.com/
  );

  assert.deepEqual(existsCalls, [
    '/mock/home/.acme.sh/alpha.example.com/fullchain.pem',
    '/mock/home/.acme.sh/alpha.example.com/privkey.pem',
    '/mock/home/.acme.sh/alpha.example.com/fullchain.cer',
    '/mock/home/.acme.sh/alpha.example.com/alpha.example.com.key',
    '/mock/home/.acme.sh/alpha.example.com_ecc/fullchain.pem',
    '/mock/home/.acme.sh/alpha.example.com_ecc/privkey.pem',
    '/mock/home/.acme.sh/alpha.example.com_ecc/fullchain.cer',
    '/mock/home/.acme.sh/alpha.example.com_ecc/alpha.example.com.key',
    '/mock/home/.acme.sh/alpha.example.com_rsa/fullchain.pem',
    '/mock/home/.acme.sh/alpha.example.com_rsa/privkey.pem',
    '/mock/home/.acme.sh/alpha.example.com_rsa/fullchain.cer',
    '/mock/home/.acme.sh/alpha.example.com_rsa/alpha.example.com.key'
  ]);
  assert.deepEqual(ensureDirCalls, []);
  assert.deepEqual(copyCalls, []);
});

test('createCertificateService activateDomain 源证书 realpath 越界时应报错且不得复制', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const resolvedRealpaths = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': createSilentLoggerModule()
  });
  const service = createCertificateService({
    filesystemService: {
      async exists() {
        return true;
      },
      async resolveRealPath(targetPath) {
        resolvedRealpaths.push(targetPath);

        if (targetPath.endsWith('/fullchain.pem')) {
          return '/escape/outside/fullchain.pem';
        }

        return targetPath;
      },
      async ensureDir(targetPath) {
        ensureDirCalls.push(targetPath);
      },
      async copyFile(from, to) {
        copyCalls.push({ from, to });
      }
    },
    pathResolver: {
      resolvePath(inputPath) {
        return inputPath === '~/.acme.sh' ? '/mock/home/.acme.sh' : inputPath;
      }
    }
  });

  await assert.rejects(() => service.activateDomain('alpha.example.com'), /outside allowed root/i);

  assert.ok(resolvedRealpaths.includes('/mock/home/.acme.sh/alpha.example.com/fullchain.pem'));
  assert.deepEqual(ensureDirCalls, []);
  assert.deepEqual(copyCalls, []);
});

test('createCertificateService activateDomain 目标文件尚不存在时应允许继续复制', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const resolvedRealpaths = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': createSilentLoggerModule()
  });
  const service = createCertificateService({
    filesystemService: {
      async exists() {
        return true;
      },
      async resolveRealPath(targetPath) {
        resolvedRealpaths.push(targetPath);

        if (
          targetPath === '/root/tlboot/alpha.example.com/fullchain.pem' ||
          targetPath === '/root/tlboot/alpha.example.com/privkey.pem'
        ) {
          const error = new Error(`ENOENT: no such file or directory, realpath '${targetPath}'`);
          error.code = 'ENOENT';
          throw error;
        }

        return targetPath;
      },
      async ensureDir(targetPath) {
        ensureDirCalls.push(targetPath);
      },
      async copyFile(from, to) {
        copyCalls.push({ from, to });
      }
    },
    pathResolver: {
      resolvePath(inputPath) {
        return inputPath === '~/.acme.sh' ? '/mock/home/.acme.sh' : inputPath;
      }
    }
  });

  const result = await service.activateDomain('alpha.example.com');

  assert.deepEqual(ensureDirCalls, ['/root/tlboot/alpha.example.com']);
  assert.ok(resolvedRealpaths.includes('/root/tlboot/alpha.example.com'));
  assert.ok(resolvedRealpaths.includes('/root/tlboot/alpha.example.com/fullchain.pem'));
  assert.ok(resolvedRealpaths.includes('/root/tlboot/alpha.example.com/privkey.pem'));
  assert.deepEqual(copyCalls, [
    {
      from: '/mock/home/.acme.sh/alpha.example.com/fullchain.pem',
      to: '/root/tlboot/alpha.example.com/fullchain.pem'
    },
    {
      from: '/mock/home/.acme.sh/alpha.example.com/privkey.pem',
      to: '/root/tlboot/alpha.example.com/privkey.pem'
    }
  ]);
  assert.deepEqual(result, {
    domain: 'alpha.example.com',
    fullchainPath: '/root/tlboot/alpha.example.com/fullchain.pem',
    privkeyPath: '/root/tlboot/alpha.example.com/privkey.pem'
  });
});

test('createCertificateService activateDomain 目标文件 realpath 越界时应报错且不得复制', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const resolvedRealpaths = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': createSilentLoggerModule()
  });
  const service = createCertificateService({
    filesystemService: {
      async exists() {
        return true;
      },
      async resolveRealPath(targetPath) {
        resolvedRealpaths.push(targetPath);

        if (targetPath === '/root/tlboot/alpha.example.com/fullchain.pem') {
          return '/escape/outside/fullchain.pem';
        }

        return targetPath;
      },
      async ensureDir(targetPath) {
        ensureDirCalls.push(targetPath);
      },
      async copyFile(from, to) {
        copyCalls.push({ from, to });
      }
    },
    pathResolver: {
      resolvePath(inputPath) {
        return inputPath === '~/.acme.sh' ? '/mock/home/.acme.sh' : inputPath;
      }
    }
  });

  await assert.rejects(() => service.activateDomain('alpha.example.com'), /outside allowed root/i);

  assert.ok(resolvedRealpaths.includes('/root/tlboot/alpha.example.com/fullchain.pem'));
  assert.deepEqual(ensureDirCalls, ['/root/tlboot/alpha.example.com']);
  assert.deepEqual(copyCalls, []);
});
