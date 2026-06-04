/**
 * 概述：覆盖 Telegram 命令服务在 /servers 命令下的回复文本格式，确保服务器名称后附带 server id。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createTelegramCommandService } = require('../src/services/telegram-command-service');

/**
 * 创建用于 /servers 命令测试的服务实例。
 * 核心分支语义：内部接口先返回已绑定管理员，再返回服务器健康列表，最后捕获回发到 Telegram 的文本。
 * @returns {{ service: { handleUpdate: Function }, sentMessages: Array<{ chatId: string, text: string }> }} 命令服务与消息捕获结果。
 */
function createServersCommandHarness() {
  const sentMessages = [];
  const requestCalls = [];
  const service = createTelegramCommandService({
    configService: {
      async getConfigs() {
        return {
          internal_api_base_url: 'https://internal.example.com',
          internal_api_secret: 'internal-secret'
        };
      }
    },
    internalApiServiceFactory() {
      return {
        async request(options) {
          requestCalls.push(options);

          if (options.path === '/api/internal/telegram/admin/by-chat/123456') {
            return {
              code: 0,
              message: 'ok',
              data: {
                bound: true
              }
            };
          }

          if (options.path === '/api/internal/telegram/servers/health?chat_id=123456&include_servers=1') {
            return {
              code: 0,
              message: 'ok',
              data: {
                servers: [
                  {
                    server_id: 4,
                    server_name: '美国01-达拉斯',
                    panel_api_status: 'healthy',
                    panel_auth_status: 'healthy',
                    xray_runtime_status: 'running'
                  }
                ]
              }
            };
          }

          throw new Error(`unexpected request: ${options.path}`);
        }
      };
    },
    telegramApiService: {
      async sendMessage(payload) {
        sentMessages.push(payload);
        return {
          ok: true,
          result: {
            message_id: 1001
          }
        };
      }
    }
  });

  return {
    service,
    sentMessages,
    requestCalls
  };
}

test('createTelegramCommandService should append server id to each /servers entry title', async () => {
  const { service, sentMessages } = createServersCommandHarness();

  await service.handleUpdate({
    update_id: 1,
    message: {
      text: '/servers',
      chat: {
        id: 123456
      },
      from: {
        id: 777
      }
    }
  });

  assert.equal(sentMessages.length, 1);
  assert.equal(
    sentMessages[0].text,
    '服务器列表\n1. 美国01-达拉斯（server id: 4）\n面板 API：healthy\n面板鉴权：healthy\nXray：running'
  );
});
