/**
 * 概述：覆盖 Task 6 管理员认证与配置 API 的最小测试，重点验证应用注入点、401 鉴权分支与认证结果透传。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createAdminRoutes } = require('../src/routes/admin-routes');
const { createAdminAuthService } = require('../src/services/admin-auth-service');
const { createAdminAuthMiddleware } = require('../src/middlewares/admin-auth-middleware');

/**
 * 创建最小 fake express，实现当前测试需要的应用、路由与中间件分发。
 * @returns {Function & {Router: Function, json: Function}} fake express 导出。
 */
function createFakeExpress() {
  /**
   * 创建最小路由宿主。
   * @returns {{use: Function, get: Function, post: Function, handle: Function}} fake app/router。
   */
  function createLayerHost() {
    const layers = [];

    return {
      use(pathOrHandler, maybeHandler) {
        const hasPath = typeof pathOrHandler === 'string';

        layers.push({
          type: 'use',
          path: hasPath ? pathOrHandler : null,
          handler: hasPath ? maybeHandler : pathOrHandler
        });
      },
      get(routePath, ...handlers) {
        layers.push({
          type: 'route',
          method: 'GET',
          path: routePath,
          handlers
        });
      },
      post(routePath, ...handlers) {
        layers.push({
          type: 'route',
          method: 'POST',
          path: routePath,
          handlers
        });
      },
      put(routePath, ...handlers) {
        layers.push({
          type: 'route',
          method: 'PUT',
          path: routePath,
          handlers
        });
      },
      async handle(req, res) {
        const originalRemainingPath = req._remainingPath || req.originalUrl || '/';
        let layerIndex = 0;

        req._remainingPath = originalRemainingPath;

        /**
         * 继续执行 layer。
         * @param {Error | null} error - 当前错误对象。
         */
        async function next(error) {
          while (layerIndex < layers.length) {
            const layer = layers[layerIndex];

            layerIndex += 1;

            if (layer.type === 'route') {
              if (
                error ||
                req.method !== layer.method ||
                (layer.path !== '*' && req._remainingPath !== layer.path)
              ) {
                continue;
              }

              await runHandlers(layer.handlers, error);
              return;
            }

            const isErrorHandler = layer.handler.length === 4;
            const matchesPath =
              layer.path === null ||
              req._remainingPath === layer.path ||
              req._remainingPath.startsWith(`${layer.path}/`);

            if (error) {
              if (!isErrorHandler || !matchesPath) {
                continue;
              }

              await layer.handler(error, req, res, next);
              return;
            }

            if (isErrorHandler || !matchesPath) {
              continue;
            }

            if (typeof layer.handler.handle === 'function') {
              const previousPath = req._remainingPath;

              if (layer.path !== null) {
                const nestedPath = previousPath.slice(layer.path.length) || '/';

                req._remainingPath = nestedPath.startsWith('/') ? nestedPath : `/${nestedPath}`;
              }

              await layer.handler.handle(req, res, async (nestedError) => {
                req._remainingPath = previousPath;
                await next(nestedError);
              });
              return;
            }

            await layer.handler(req, res, next);
            return;
          }

          if (error) {
            throw error;
          }
        }

        /**
         * 顺序执行同一路由上的处理器链。
         * @param {Function[]} handlers - 路由处理器数组。
         * @param {Error | null} initialError - 初始错误对象。
         */
        async function runHandlers(handlers, initialError) {
          let handlerIndex = 0;

          async function runNext(error) {
            if (error) {
              await next(error);
              return;
            }

            if (handlerIndex >= handlers.length) {
              await next(null);
              return;
            }

            const handler = handlers[handlerIndex];

            handlerIndex += 1;
            await handler(req, res, runNext);
          }

          await runNext(initialError);
        }

        await next(null);
      }
    };
  }

  function express() {
    return createLayerHost();
  }

  express.Router = function Router() {
    return createLayerHost();
  };
  express.json = function json() {
    return (_req, _res, next) => next();
  };

  return express;
}

/**
 * 创建最小响应对象。
 * @returns {{statusCode: number, body: unknown, status: Function, json: Function, on: Function}} fake response。
 */
function createResponse() {
  return {
    statusCode: 200,
    body: null,
    sentFilePath: '',
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    sendFile(filePath) {
      this.sentFilePath = filePath;
      this.body = {
        sentFile: filePath
      };
      return this;
    },
    on() {}
  };
}

/**
 * 使用注入后的应用分发请求。
 * @param {{ app: { handle: Function }, method: string, path: string, headers?: Record<string, string>, body?: unknown }} options - 分发参数。
 * @returns {Promise<{statusCode: number, body: unknown}>} 响应结果。
 */
async function dispatchRequest({ app, method, path, headers = {}, body }) {
  const req = {
    method,
    originalUrl: path,
    headers,
    body
  };
  const res = createResponse();

  await app.handle(req, res);
  await new Promise((resolve) => setImmediate(resolve));

  return {
    statusCode: res.statusCode,
    body: res.body
  };
}

test('createApp should mount injected adminRoutes when expressLib and adminRoutes are provided', async () => {
  const expressLib = createFakeExpress();
  const adminRoutes = expressLib.Router();

  adminRoutes.get('/injected', (_req, res) => {
    res.json({
      code: 0,
      message: 'ok',
      data: {
        injected: true
      }
    });
  });

  const app = createApp({
    expressLib,
    adminRoutes
  });
  const response = await dispatchRequest({
    app,
    method: 'GET',
    path: '/api/admin/injected'
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    code: 0,
    message: 'ok',
    data: {
      injected: true
    }
  });
});

test('GET /login should fall back to the built admin SPA entry instead of returning API 404', async () => {
  const expressLib = createFakeExpress();

  expressLib.static = function staticMiddleware() {
    return (_req, _res, next) => next();
  };

  const app = createApp({
    expressLib
  });
  const response = await dispatchRequest({
    app,
    method: 'GET',
    path: '/login',
    headers: {
      accept: 'text/html'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.body.sentFile.endsWith('web\\dist\\index.html') ||
      response.body.sentFile.endsWith('web/dist/index.html'),
    true
  );
});

test('GET /api/admin/config should return 401 when authorization header is missing', async () => {
  const expressLib = createFakeExpress();
  const authService = createAdminAuthService({
    devAuth: {
      token: 'task6-token',
      adminId: 'admin-task6',
      sessionId: 'session-task6',
      tokenType: 'Bearer'
    }
  });
  const app = createApp({
    expressLib,
    adminRoutes: createAdminRoutes({
      expressLib,
      authService
    })
  });
  const response = await dispatchRequest({
    app,
    method: 'GET',
    path: '/api/admin/config'
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    code: 401,
    message: '未授权访问',
    data: null
  });
});

test('POST /api/admin/auth/login should return injected development token', async () => {
  const expressLib = createFakeExpress();
  const authService = createAdminAuthService({
    devAuth: {
      token: 'task6-token',
      adminId: 'admin-task6',
      sessionId: 'session-task6',
      tokenType: 'Bearer'
    }
  });
  const app = createApp({
    expressLib,
    adminRoutes: createAdminRoutes({
      expressLib,
      authService
    })
  });
  const response = await dispatchRequest({
    app,
    method: 'POST',
    path: '/api/admin/auth/login',
    body: {
      username: 'admin',
      password: 'dev-password'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    code: 0,
    message: 'ok',
    data: {
      token: 'task6-token',
      tokenType: 'Bearer'
    }
  });
});

test('createApp default admin route chain should use injected devAuth without manual authService wiring', async () => {
  const expressLib = createFakeExpress();
  const app = createApp({
    expressLib,
    devAuth: {
      token: 'chain-token',
      adminId: 'chain-admin',
      sessionId: 'chain-session',
      tokenType: 'Bearer'
    }
  });
  const loginResponse = await dispatchRequest({
    app,
    method: 'POST',
    path: '/api/admin/auth/login',
    body: {
      username: 'admin',
      password: 'dev-password'
    }
  });
  const configResponse = await dispatchRequest({
    app,
    method: 'GET',
    path: '/api/admin/config',
    headers: {
      authorization: `Bearer ${loginResponse.body.data.token}`
    }
  });

  assert.equal(loginResponse.statusCode, 200);
  assert.deepEqual(loginResponse.body, {
    code: 0,
    message: 'ok',
    data: {
      token: 'chain-token',
      tokenType: 'Bearer'
    }
  });
  assert.equal(configResponse.statusCode, 200);
  assert.deepEqual(configResponse.body, {
    code: 0,
    message: 'ok',
    data: {
      config: {
        telegram_bot_token: '',
        webhook_path: '',
        webhook_base_url: '',
        internal_api_base_url: '',
        internal_api_secret: '',
        selected_certificate_domain: '',
        tls_fullchain_path: '',
        tls_privkey_path: ''
      }
    }
  });
});

test('GET /api/admin/certificates/status should require authorization and return certificate skeleton payload', async () => {
  const expressLib = createFakeExpress();
  const app = createApp({
    expressLib,
    devAuth: {
      token: 'status-token',
      adminId: 'status-admin',
      sessionId: 'status-session',
      tokenType: 'Bearer'
    }
  });
  const unauthorizedResponse = await dispatchRequest({
    app,
    method: 'GET',
    path: '/api/admin/certificates/status'
  });
  const authorizedResponse = await dispatchRequest({
    app,
    method: 'GET',
    path: '/api/admin/certificates/status',
    headers: {
      authorization: 'Bearer status-token'
    }
  });

  assert.equal(unauthorizedResponse.statusCode, 401);
  assert.deepEqual(unauthorizedResponse.body, {
    code: 401,
    message: '未授权访问',
    data: null
  });
  assert.equal(authorizedResponse.statusCode, 200);
  assert.deepEqual(authorizedResponse.body, {
    code: 0,
    message: 'ok',
    data: {
      ready: false,
      selected_certificate_domain: '',
      tls_fullchain_path: '',
      tls_privkey_path: ''
    }
  });
});

test('GET /api/admin/status should return status skeleton payload after authentication', async () => {
  const expressLib = createFakeExpress();
  const app = createApp({
    expressLib,
    devAuth: {
      token: 'overview-token',
      adminId: 'overview-admin',
      sessionId: 'overview-session',
      tokenType: 'Bearer'
    }
  });
  const response = await dispatchRequest({
    app,
    method: 'GET',
    path: '/api/admin/status',
    headers: {
      authorization: 'Bearer overview-token'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    code: 0,
    message: 'ok',
    data: {
      status: 'ready'
    }
  });
});

test('admin auth middleware should attach auth result to req.adminAuth after token verification', () => {
  const middleware = createAdminAuthMiddleware({
    authService: {
      verifyToken(token) {
        if (token !== 'verified-token') {
          return null;
        }

        return {
          adminId: 'admin-1',
          sessionId: 'session-1',
          tokenType: 'Bearer'
        };
      }
    }
  });
  const req = {
    originalUrl: '/api/admin/config',
    headers: {
      authorization: 'Bearer verified-token'
    }
  };
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.body, null);
  assert.deepEqual(req.adminAuth, {
    adminId: 'admin-1',
    sessionId: 'session-1',
    tokenType: 'Bearer'
  });
});

test('PUT /api/admin/config should persist config entries and GET /api/admin/config should return the saved snapshot', async () => {
  const expressLib = createFakeExpress();
  const savedEntries = [];
  const configMap = new Map();
  const app = createApp({
    expressLib,
    devAuth: {
      token: 'config-token',
      adminId: 'config-admin',
      sessionId: 'config-session',
      tokenType: 'Bearer'
    },
    adminRoutes: createAdminRoutes({
      expressLib,
      authService: createAdminAuthService({
        devAuth: {
          token: 'config-token',
          adminId: 'config-admin',
          sessionId: 'config-session',
          tokenType: 'Bearer'
        }
      }),
      configService: {
        async saveConfigs(entries) {
          savedEntries.push(...entries);
          entries.forEach((entry) => {
            configMap.set(entry.key, {
              key: entry.key,
              value: entry.value
            });
          });
          return entries;
        },
        async getConfigs(keys) {
          return keys.reduce((result, key) => {
            result[key] = configMap.has(key) ? configMap.get(key).value : '';
            return result;
          }, {});
        }
      }
    })
  });

  const saveResponse = await dispatchRequest({
    app,
    method: 'PUT',
    path: '/api/admin/config',
    headers: {
      authorization: 'Bearer config-token'
    },
    body: {
      telegram_bot_token: 'bot-token-value',
      webhook_path: '/telegram/webhook',
      internal_api_base_url: 'https://internal.example.com'
    }
  });
  const getResponse = await dispatchRequest({
    app,
    method: 'GET',
    path: '/api/admin/config',
    headers: {
      authorization: 'Bearer config-token'
    }
  });

  assert.equal(saveResponse.statusCode, 200);
  assert.equal(savedEntries.length, 3);
  assert.deepEqual(getResponse.body, {
    code: 0,
    message: 'ok',
    data: {
      config: {
        telegram_bot_token: 'bot-token-value',
        webhook_path: '/telegram/webhook',
        internal_api_base_url: 'https://internal.example.com',
        internal_api_secret: '',
        webhook_base_url: '',
        selected_certificate_domain: '',
        tls_fullchain_path: '',
        tls_privkey_path: ''
      }
    }
  });
});

test('GET /api/admin/certificates/domains should return injected certificate domain list', async () => {
  const expressLib = createFakeExpress();
  const app = createApp({
    expressLib,
    adminRoutes: createAdminRoutes({
      expressLib,
      authService: createAdminAuthService({
        devAuth: {
          token: 'domain-token',
          adminId: 'domain-admin',
          sessionId: 'domain-session',
          tokenType: 'Bearer'
        }
      }),
      certificateService: {
        async listDomains() {
          return ['example.com', 'bot.example.com'];
        }
      }
    })
  });

  const response = await dispatchRequest({
    app,
    method: 'GET',
    path: '/api/admin/certificates/domains',
    headers: {
      authorization: 'Bearer domain-token'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    code: 0,
    message: 'ok',
    data: {
      domains: ['example.com', 'bot.example.com']
    }
  });
});

test('POST /api/admin/certificates/select should activate domain and persist selected certificate paths', async () => {
  const expressLib = createFakeExpress();
  const savedEntries = [];
  const app = createApp({
    expressLib,
    adminRoutes: createAdminRoutes({
      expressLib,
      authService: createAdminAuthService({
        devAuth: {
          token: 'select-token',
          adminId: 'select-admin',
          sessionId: 'select-session',
          tokenType: 'Bearer'
        }
      }),
      configService: {
        async saveConfigs(entries) {
          savedEntries.push(...entries);
          return entries;
        },
        async getConfigs() {
          return {};
        }
      },
      certificateService: {
        async activateDomain(domain) {
          return {
            domain,
            fullchainPath: `/root/tlboot/${domain}/fullchain.pem`,
            privkeyPath: `/root/tlboot/${domain}/privkey.pem`
          };
        }
      }
    })
  });

  const response = await dispatchRequest({
    app,
    method: 'POST',
    path: '/api/admin/certificates/select',
    headers: {
      authorization: 'Bearer select-token'
    },
    body: {
      domain: 'example.com'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(savedEntries.length, 3);
  assert.deepEqual(response.body, {
    code: 0,
    message: 'ok',
    data: {
      selected_certificate_domain: 'example.com',
      tls_fullchain_path: '/root/tlboot/example.com/fullchain.pem',
      tls_privkey_path: '/root/tlboot/example.com/privkey.pem'
    }
  });
});

test('POST /api/admin/webhook/register and GET /api/admin/status/overview should return integrated admin data', async () => {
  const expressLib = createFakeExpress();
  const app = createApp({
    expressLib,
    adminRoutes: createAdminRoutes({
      expressLib,
      authService: createAdminAuthService({
        devAuth: {
          token: 'overview-token',
          adminId: 'overview-admin',
          sessionId: 'overview-session',
          tokenType: 'Bearer'
        }
      }),
      configService: {
        async saveConfigs() {
          return [];
        },
        async getConfigs() {
          return {
            webhook_base_url: 'https://bot.example.com',
            webhook_path: '/telegram/webhook',
            selected_certificate_domain: 'example.com',
            tls_fullchain_path: '/root/tlboot/example.com/fullchain.pem',
            tls_privkey_path: '/root/tlboot/example.com/privkey.pem'
          };
        }
      },
      certificateService: {
        async listDomains() {
          return ['example.com'];
        }
      },
      telegramApiService: {
        async setWebhook(payload) {
          return {
            ok: true,
            mocked: true,
            method: 'setWebhook',
            payload
          };
        }
      }
    })
  });

  const registerResponse = await dispatchRequest({
    app,
    method: 'POST',
    path: '/api/admin/webhook/register',
    headers: {
      authorization: 'Bearer overview-token'
    }
  });
  const overviewResponse = await dispatchRequest({
    app,
    method: 'GET',
    path: '/api/admin/status/overview',
    headers: {
      authorization: 'Bearer overview-token'
    }
  });

  assert.equal(registerResponse.statusCode, 200);
  assert.deepEqual(registerResponse.body, {
    code: 0,
    message: 'ok',
    data: {
      registered: true,
      webhook_url: 'https://bot.example.com/telegram/webhook'
    }
  });
  assert.equal(overviewResponse.statusCode, 200);
  assert.deepEqual(overviewResponse.body, {
    code: 0,
    message: 'ok',
    data: {
      webhook_url: 'https://bot.example.com/telegram/webhook',
      selected_certificate_domain: 'example.com',
      tls_fullchain_path: '/root/tlboot/example.com/fullchain.pem',
      tls_privkey_path: '/root/tlboot/example.com/privkey.pem',
      certificate_ready: true
    }
  });
});
