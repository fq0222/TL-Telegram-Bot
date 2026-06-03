/**
 * 概述：Task 5 证书服务测试，覆盖 ACME 目录扫描与激活证书复制两个核心场景。
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

test('createCertificateService listDomains 只返回同时具备双证书文件的域名', async () => {
  const fileState = new Set([
    '/mock/home/.acme.sh/alpha.example.com/fullchain.pem',
    '/mock/home/.acme.sh/alpha.example.com/privkey.pem',
    '/mock/home/.acme.sh/beta.example.com/fullchain.pem',
    '/mock/home/.acme.sh/gamma.example.com/privkey.pem'
  ]);
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error() {}
        };
      }
    }
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

test('createCertificateService activateDomain 复制证书后返回正确目标路径', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error() {}
        };
      }
    }
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

test('createCertificateService activateDomain 遇到非法域名时应报错且不得执行复制', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error() {}
        };
      }
    }
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
    '../utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error() {}
        };
      }
    }
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
    '/mock/home/.acme.sh/alpha.example.com/privkey.pem'
  ]);
  assert.deepEqual(ensureDirCalls, []);
  assert.deepEqual(copyCalls, []);
});

test('createCertificateService activateDomain 源证书 realpath 越界时应报错且不得复制', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const resolvedRealpaths = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error() {}
        };
      }
    }
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

  await assert.rejects(
    () => service.activateDomain('alpha.example.com'),
    /outside allowed root/i
  );

  assert.ok(resolvedRealpaths.includes('/mock/home/.acme.sh/alpha.example.com/fullchain.pem'));
  assert.deepEqual(ensureDirCalls, []);
  assert.deepEqual(copyCalls, []);
});

test('createCertificateService activateDomain 目标文件 realpath 越界时应报错且不得复制', async () => {
  const ensureDirCalls = [];
  const copyCalls = [];
  const resolvedRealpaths = [];
  const { createCertificateService } = loadWithMocks(path.resolve(__dirname, '../src/services/certificate-service.js'), {
    '../utils/logger': {
      createLogger() {
        return {
          info() {},
          warn() {},
          error() {}
        };
      }
    }
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

  await assert.rejects(
    () => service.activateDomain('alpha.example.com'),
    /outside allowed root/i
  );

  assert.ok(resolvedRealpaths.includes('/root/tlboot/alpha.example.com/fullchain.pem'));
  assert.deepEqual(ensureDirCalls, ['/root/tlboot/alpha.example.com']);
  assert.deepEqual(copyCalls, []);
});
