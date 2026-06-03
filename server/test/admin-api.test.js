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
      handle(req, res) {
        const originalRemainingPath = req._remainingPath || req.originalUrl || '/';
        let layerIndex = 0;

        req._remainingPath = originalRemainingPath;

        /**
         * 继续执行 layer。
         * @param {Error | null} error - 当前错误对象。
         */
        function next(error) {
          while (layerIndex < layers.length) {
            const layer = layers[layerIndex];

            layerIndex += 1;

            if (layer.type === 'route') {
              if (error || req.method !== layer.method || req._remainingPath !== layer.path) {
                continue;
              }

              runHandlers(layer.handlers, error);
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

              layer.handler(error, req, res, next);
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

              layer.handler.handle(req, res, (nestedError) => {
                req._remainingPath = previousPath;
                next(nestedError);
              });
              return;
            }

            layer.handler(req, res, next);
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
        function runHandlers(handlers, initialError) {
          let handlerIndex = 0;

          function runNext(error) {
            if (error) {
              next(error);
              return;
            }

            if (handlerIndex >= handlers.length) {
              next(null);
              return;
            }

            const handler = handlers[handlerIndex];

            handlerIndex += 1;
            handler(req, res, runNext);
          }

          runNext(initialError);
        }

        next(null);
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
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    on() {}
  };
}

/**
 * 使用注入后的应用分发请求。
 * @param {{ app: { handle: Function }, method: string, path: string, headers?: Record<string, string>, body?: unknown }} options - 分发参数。
 * @returns {{statusCode: number, body: unknown}} 响应结果。
 */
function dispatchRequest({ app, method, path, headers = {}, body }) {
  const req = {
    method,
    originalUrl: path,
    headers,
    body
  };
  const res = createResponse();

  app.handle(req, res);

  return {
    statusCode: res.statusCode,
    body: res.body
  };
}

test('createApp should mount injected adminRoutes when expressLib and adminRoutes are provided', () => {
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
  const response = dispatchRequest({
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

test('GET /api/admin/config should return 401 when authorization header is missing', () => {
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
  const response = dispatchRequest({
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

test('POST /api/admin/auth/login should return injected development token', () => {
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
  const response = dispatchRequest({
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

test('createApp default admin route chain should use injected devAuth without manual authService wiring', () => {
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
  const loginResponse = dispatchRequest({
    app,
    method: 'POST',
    path: '/api/admin/auth/login',
    body: {
      username: 'admin',
      password: 'dev-password'
    }
  });
  const configResponse = dispatchRequest({
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
      config: {}
    }
  });
});

test('GET /api/admin/certificates/status should require authorization and return certificate skeleton payload', () => {
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
  const unauthorizedResponse = dispatchRequest({
    app,
    method: 'GET',
    path: '/api/admin/certificates/status'
  });
  const authorizedResponse = dispatchRequest({
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
      ready: false
    }
  });
});

test('GET /api/admin/status should return status skeleton payload after authentication', () => {
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
  const response = dispatchRequest({
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
