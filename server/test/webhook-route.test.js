/**
 * 概述：覆盖 Telegram Webhook 路由与命令分发联调链路，
 * 重点验证命令识别、内部接口映射与 POST /telegram/webhook 的统一成功响应。
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
   * @returns {{use: Function, get: Function, post: Function, put: Function, handle: Function}} fake app/router。
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
      handle(req, res, done = () => {}) {
        const originalRemainingPath = req._remainingPath || req.originalUrl || '/';
        let layerIndex = 0;

        req._remainingPath = originalRemainingPath;

        /**
         * 统一执行普通处理器或错误处理中间件，并兼容 Promise 返回值。
         * @param {Function} handler - 当前待执行处理器。
         * @param {Array<unknown>} args - 调用参数。
         * @returns {void}
         */
        function invokeHandler(handler, args) {
          try {
            const result = handler(...args);

            if (result && typeof result.then === 'function') {
              result.then(() => undefined).catch((error) => args[args.length - 1](error));
            }
          } catch (error) {
            args[args.length - 1](error);
          }
        }

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

              runHandlers(layer.handlers);
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

              invokeHandler(layer.handler, [error, req, res, next]);
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

            invokeHandler(layer.handler, [req, res, next]);
            return;
          }

          done(error || null);
        }

        /**
         * 顺序执行同一路由上的处理器链。
         * @param {Function[]} handlers - 路由处理器数组。
         */
        function runHandlers(handlers) {
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
            invokeHandler(handler, [req, res, runNext]);
          }

          runNext(null);
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
 * @returns {{
 *   statusCode: number,
 *   body: unknown,
 *   status: Function,
 *   json: Function,
 *   on: Function
 * }} fake response。
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
 * @returns {Promise<{statusCode: number, body: unknown}>} 响应结果。
 */
function dispatchRequest({ app, method, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      originalUrl: path,
      headers,
      body
    };
    const res = createResponse();
    const originalJson = res.json;
    let settled = false;

    res.json = function patchedJson(payload) {
      originalJson.call(this, payload);

      if (!settled) {
        settled = true;
        resolve({
          statusCode: res.statusCode,
          body: res.body
        });
      }

      return this;
    };

    app.handle(req, res, (error) => {
      if (settled) {
        return;
      }

      if (error) {
        settled = true;
        reject(error);
        return;
      }

      settled = true;
      resolve({
        statusCode: res.statusCode,
        body: res.body
      });
    });
  });
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

test('createTelegramCommandService should dispatch /status to internal API after admin binding check', async () => {
  const requestCalls = [];
  const commandService = createTelegramCommandService({
    configService: {
      async getConfigs() {
        return {
          internal_api_base_url: 'http://internal.example.com',
          internal_api_secret: 'test-secret'
        };
      }
    },
    internalApiServiceFactory() {
      return {
        async request(options) {
          requestCalls.push(options);

          if (options.path === '/api/internal/telegram/admin/by-chat/20001') {
            return {
              code: 0,
              message: 'ok',
              data: {
                bound: true
              }
            };
          }

          return {
            code: 0,
            message: 'ok',
            data: {
              total_servers: 2
            }
          };
        }
      };
    }
  });

  const result = await commandService.handleUpdate({
    update_id: 123456789,
    message: {
      text: '/status',
      chat: {
        id: 20001,
        type: 'private'
      },
      from: {
        id: 30001,
        username: 'task7_user',
        first_name: 'Task7',
        last_name: 'User'
      }
    }
  });

  assert.deepEqual(requestCalls, [
    {
      method: 'GET',
      path: '/api/internal/telegram/admin/by-chat/20001',
      parseAs: 'json'
    },
    {
      method: 'GET',
      path: '/api/internal/telegram/servers/health?chat_id=20001',
      parseAs: 'json'
    }
  ]);
  assert.equal(result.dispatch.ok, true);
  assert.deepEqual(result.dispatch.request, {
    method: 'GET',
    path: '/api/internal/telegram/servers/health?chat_id=20001'
  });
});

test('createTelegramCommandService should send Telegram reply after internal API dispatch succeeds', async () => {
  const sentMessages = [];
  const commandService = createTelegramCommandService({
    configService: {
      async getConfigs() {
        return {
          internal_api_base_url: 'http://internal.example.com',
          internal_api_secret: 'test-secret'
        };
      }
    },
    internalApiServiceFactory() {
      return {
        async request(options) {
          if (options.path === '/api/internal/telegram/admin/by-chat/20001') {
            return {
              code: 0,
              message: 'ok',
              data: {
                bound: true
              }
            };
          }

          return {
            code: 0,
            message: 'ok',
            data: {
              total_servers: 1,
              healthy_servers: 1,
              unhealthy_servers: 0
            }
          };
        }
      };
    },
    telegramApiService: {
      async sendMessage(payload) {
        sentMessages.push(payload);
        return {
          ok: true,
          result: {
            message_id: 1
          }
        };
      }
    }
  });

  const result = await commandService.handleUpdate({
    update_id: 123456790,
    message: {
      text: '/status',
      chat: {
        id: 20001,
        type: 'private'
      },
      from: {
        id: 30001
      }
    }
  });

  assert.equal(result.dispatch.ok, true);
  assert.deepEqual(sentMessages, [
    {
      chatId: '20001',
      text: '服务器状态汇总\n总数：1\n健康：1\n异常：0'
    }
  ]);
  assert.deepEqual(result.reply, {
    attempted: true,
    ok: true,
    messageId: 1
  });
});

test('createTelegramCommandService should dispatch /bind directly to internal API bind verify endpoint', async () => {
  const requestCalls = [];
  const commandService = createTelegramCommandService({
    configService: {
      async getConfigs() {
        return {
          internal_api_base_url: 'http://internal.example.com',
          internal_api_secret: 'test-secret'
        };
      }
    },
    internalApiServiceFactory() {
      return {
        async request(options) {
          requestCalls.push(options);
          return {
            code: 0,
            message: 'ok',
            data: {
              bound: true
            }
          };
        }
      };
    }
  });

  const result = await commandService.handleUpdate({
    update_id: 123456789,
    message: {
      text: '/bind TG-ADMIN-ABCD1234',
      chat: {
        id: 20001,
        type: 'private'
      },
      from: {
        id: 30001,
        username: 'task7_user',
        first_name: 'Task7',
        last_name: 'User'
      }
    }
  });

  assert.equal(requestCalls.length, 1);
  assert.deepEqual(requestCalls[0], {
    method: 'POST',
    path: '/api/internal/telegram/admin/bind/verify',
    body: {
      bind_code: 'TG-ADMIN-ABCD1234',
      chat_id: '20001',
      telegram_user_id: '30001',
      telegram_username: 'task7_user',
      telegram_first_name: 'Task7',
      telegram_last_name: 'User'
    },
    parseAs: 'json'
  });
  assert.equal(result.dispatch.ok, true);
});

test('POST /telegram/webhook should return 200 and unified success structure for a standard update payload', async () => {
  const expressLib = createFakeExpress();
  const app = createApp({
    expressLib,
    commandService: {
      async handleUpdate(update) {
        return {
          processed: true,
          updateId: update.update_id,
          command: {
            command: 'status',
            argument: ''
          },
          dispatch: {
            attempted: true,
            ok: true,
            request: {
              method: 'GET',
              path: '/api/internal/telegram/servers/health?chat_id=20001'
            },
            response: {
              code: 0,
              message: 'ok',
              data: {
                total_servers: 2
              }
            }
          }
        };
      }
    }
  });
  const response = await dispatchRequest({
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
      },
      dispatch: {
        attempted: true,
        ok: true,
        request: {
          method: 'GET',
          path: '/api/internal/telegram/servers/health?chat_id=20001'
        },
        response: {
          code: 0,
          message: 'ok',
          data: {
            total_servers: 2
          }
        }
      }
    }
  });
});
