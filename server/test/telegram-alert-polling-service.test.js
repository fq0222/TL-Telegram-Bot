/**
 * 概述：覆盖 Telegram 告警轮询服务的待发送告警拉取、主动推送与发送回执闭环。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createTelegramAlertPollingService } = require('../src/services/telegram-alert-polling-service');

test('createTelegramAlertPollingService should pull pending alerts, notify recipients, and acknowledge sent result', async () => {
  const requestCalls = [];
  const sentMessages = [];
  const service = createTelegramAlertPollingService({
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

          if (options.method === 'GET' && options.path === '/api/internal/telegram/alerts/pending?limit=10') {
            return {
              code: 0,
              message: 'ok',
              data: {
                list: [
                  {
                    alert_id: 10,
                    server_id: 4,
                    server_name: '美国01-达拉斯',
                    alert_type: 'xray_not_running',
                    status: 'open',
                    title: 'Xray 未运行',
                    message: 'xray status=stopped',
                    recipients: [
                      {
                        binding_id: 1,
                        chat_id: '123456789'
                      },
                      {
                        binding_id: 2,
                        chat_id: '987654321'
                      }
                    ]
                  }
                ]
              }
            };
          }

          if (options.method === 'POST' && options.path === '/api/internal/telegram/alerts/10/sent') {
            return {
              code: 0,
              message: 'ok',
              data: {
                alert_id: 10,
                result_status: 'sent'
              }
            };
          }

          throw new Error(`unexpected request: ${options.method} ${options.path}`);
        }
      };
    },
    telegramApiService: {
      async sendMessage(payload) {
        sentMessages.push(payload);
        return {
          ok: true,
          result: {
            message_id: sentMessages.length + 100
          }
        };
      }
    }
  });

  const result = await service.pollOnce();

  assert.equal(sentMessages.length, 2);
  assert.deepEqual(sentMessages, [
    {
      chatId: '123456789',
      text: '告警通知\n服务器：美国01-达拉斯（ID: 4）\n类型：xray_not_running\n标题：Xray 未运行\n详情：xray status=stopped'
    },
    {
      chatId: '987654321',
      text: '告警通知\n服务器：美国01-达拉斯（ID: 4）\n类型：xray_not_running\n标题：Xray 未运行\n详情：xray status=stopped'
    }
  ]);
  assert.equal(requestCalls.length, 2);
  assert.deepEqual(requestCalls[1], {
    method: 'POST',
    path: '/api/internal/telegram/alerts/10/sent',
    body: {
      result_status: 'sent',
      delivered_count: 2,
      telegram_message_id: '101',
      result_message: 'ok'
    },
    parseAs: 'json'
  });
  assert.deepEqual(result, {
    ok: true,
    polled: 1,
    notified: 1
  });
});
