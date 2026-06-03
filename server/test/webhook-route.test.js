/**
 * 概述：覆盖 Task 7 Telegram Webhook 路由与命令分发骨架的最小测试，重点验证命令识别与 POST /telegram/webhook 的统一成功响应。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createTelegramCommandService } = require('../src/services/telegram-command-service');

/**
 * 创建最小 fake express，实现当前测试所需的应用、路由与中间件分发。
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

test('createTelegramCommandService should identify supported command prefixes', () => {
  const commandService = createTelegramCommandService();

  assert.deepEqual(commandService.parseCommand('/bind abc123'), {
    command: 'bind',
    argument: 'abc123'
  });
  assert.deepEqual(commandService.parseCommand('/status'), {
    command: 'status',
    argument: ''
  });
  assert.deepEqual(commandService.parseCommand('/servers'), {
    command: 'servers',
    argument: ''
  });
  assert.deepEqual(commandService.parseCommand('/server hk-01'), {
    command: 'server',
    argument: 'hk-01'
  });
  assert.deepEqual(commandService.parseCommand('/alerts'), {
    command: 'alerts',
    argument: ''
  });
  assert.deepEqual(commandService.parseCommand('/user 10001'), {
    command: 'user',
    argument: '10001'
  });
  assert.equal(commandService.parseCommand('/unknown 1'), null);
});

test('POST /telegram/webhook should return 200 and unified success structure for a standard update payload', () => {
  const expressLib = createFakeExpress();
  const app = createApp({
    expressLib
  });
  const response = dispatchRequest({
    app,
    method: 'POST',
    path: '/telegram/webhook',
    body: {
      update_id: 123456789,
      message: {
        message_id: 1,
        text: '/status',
        chat: {
          id: 20001,
          type: 'private'
        },
        from: {
          id: 30001,
          is_bot: false,
          first_name: 'Task7User'
        }
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    code: 0,
    message: 'ok',
    data: {
      processed: true,
      updateId: 123456789,
      command: {
        command: 'status',
        argument: ''
      }
    }
  });
});
