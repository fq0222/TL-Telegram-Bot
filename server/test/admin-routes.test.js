/**
 * 概述：覆盖管理端路由运行时依赖装配，重点验证证书服务会读取环境变量中的 ACME 与 TLS 目录配置。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

/**
 * 以依赖注入方式加载目标模块，避免测试触发真实数据库与网络依赖。
 * @param {string} relativeModulePath - 目标模块路径。
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

/**
 * 创建最小 fake express，满足管理端路由注册时的 Router 依赖。
 * @returns {{ Router: Function }} fake express 导出对象。
 */
function createFakeExpress() {
  return {
    Router() {
      return {
        post() {},
        get() {},
        put() {}
      };
    }
  };
}

test('createAdminRoutes 会将 ACME 与 TLS 目录环境变量注入证书服务', () => {
  const originalAcmeBasePath = process.env.ACME_BASE_PATH;
  const originalTlsTargetBasePath = process.env.TLS_TARGET_BASE_PATH;
  let receivedOptions = null;

  process.env.ACME_BASE_PATH = '/custom/acme';
  process.env.TLS_TARGET_BASE_PATH = '/custom/tlboot';

  try {
    const { createAdminRoutes } = loadWithMocks(
      path.resolve(__dirname, '../src/routes/admin-routes.js'),
      {
        '../controllers/admin-auth-controller': {
          createAdminAuthController() {
            return {
              login() {},
              getCredentials() {},
              updateCredentials() {}
            };
          }
        },
        '../controllers/admin-config-controller': {
          createAdminConfigController() {
            return {
              getConfig() {},
              saveConfig() {}
            };
          }
        },
        '../controllers/certificate-controller': {
          createCertificateController() {
            return {
              getCertificateStatus() {},
              listDomains() {},
              selectDomain() {}
            };
          }
        },
        '../controllers/status-controller': {
          createStatusController() {
            return {
              getStatus() {},
              getOverview() {},
              registerWebhook() {}
            };
          }
        },
        '../middlewares/admin-auth-middleware': {
          createAdminAuthMiddleware() {
            return function adminAuthMiddleware(_req, _res, next) {
              if (typeof next === 'function') {
                next();
              }
            };
          }
        },
        '../services/admin-auth-service': {
          createAdminAuthService() {
            return {
              login() {},
              verifyToken() {
                return null;
              }
            };
          }
        },
        '../services/admin-login-attempt-service': {
          createAdminLoginAttemptService() {
            return {
              assertAttemptAllowed() {},
              registerAttempt() {}
            };
          }
        },
        '../services/config-service': {
          createConfigService() {
            return {
              async getConfigs() {
                return {};
              },
              async saveConfigs() {
                return [];
              }
            };
          }
        },
        '../repositories/config-repository': {
          createConfigRepository() {
            return {};
          }
        },
        '../repositories/session-repository': {
          createSessionRepository() {
            return {};
          }
        },
        '../config/database': {
          createDatabase() {
            return {};
          }
        },
        '../services/certificate-service': {
          createCertificateService(options = {}) {
            receivedOptions = options;
            return {
              async listDomains() {
                return [];
              },
              async activateDomain() {
                return {};
              }
            };
          }
        },
        '../services/telegram-api-service': {
          createTelegramApiService() {
            return {
              async setWebhook() {},
              async getWebhookInfo() {
                return {};
              }
            };
          }
        }
      }
    );

    createAdminRoutes({ expressLib: createFakeExpress() });

    assert.deepEqual(receivedOptions, {
      acmeBasePath: '/custom/acme',
      tlsRootPath: '/custom/tlboot'
    });
  } finally {
    if (typeof originalAcmeBasePath === 'undefined') {
      delete process.env.ACME_BASE_PATH;
    } else {
      process.env.ACME_BASE_PATH = originalAcmeBasePath;
    }

    if (typeof originalTlsTargetBasePath === 'undefined') {
      delete process.env.TLS_TARGET_BASE_PATH;
    } else {
      process.env.TLS_TARGET_BASE_PATH = originalTlsTargetBasePath;
    }
  }
});
