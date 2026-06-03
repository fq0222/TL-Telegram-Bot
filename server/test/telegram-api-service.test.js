/**
 * 概述：覆盖 Telegram API 服务的真实 HTTP 调用行为，
 * 重点验证 setWebhook、getWebhookInfo 与 sendMessage 会向官方 Bot API 发起正确请求。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createTelegramApiService } = require('../src/services/telegram-api-service');

/**
 * 创建最小 JSON 响应桩。
 * @param {{ ok?: boolean, status?: number, body?: unknown }} options - 响应配置。
 * @returns {{ ok: boolean, status: number, headers: { get: Function }, json: Function, text: Function }} fake fetch 响应。
 */
function createJsonResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        return String(name || '').toLowerCase() === 'content-type' ? 'application/json' : '';
      }
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

test('createTelegramApiService should call Telegram setWebhook endpoint with configured bot token', async () => {
  const fetchCalls = [];
  const service = createTelegramApiService({
    botToken: 'test-bot-token',
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return createJsonResponse({
        body: {
          ok: true,
          result: true,
          description: 'Webhook was set'
        }
      });
    }
  });

  const result = await service.setWebhook({
    url: 'https://bot.example.com/telegram/webhook'
  });

  assert.deepEqual(fetchCalls, [
    {
      url: 'https://api.telegram.org/bottest-bot-token/setWebhook',
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: 'https://bot.example.com/telegram/webhook'
        })
      }
    }
  ]);
  assert.deepEqual(result, {
    ok: true,
    result: true,
    description: 'Webhook was set'
  });
});

test('createTelegramApiService should call Telegram getWebhookInfo endpoint', async () => {
  const fetchCalls = [];
  const service = createTelegramApiService({
    botToken: 'test-bot-token',
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return createJsonResponse({
        body: {
          ok: true,
          result: {
            url: 'https://bot.example.com/telegram/webhook',
            pending_update_count: 0,
            last_error_message: ''
          }
        }
      });
    }
  });

  const result = await service.getWebhookInfo();

  assert.deepEqual(fetchCalls, [
    {
      url: 'https://api.telegram.org/bottest-bot-token/getWebhookInfo',
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }
    }
  ]);
  assert.deepEqual(result, {
    ok: true,
    result: {
      url: 'https://bot.example.com/telegram/webhook',
      pending_update_count: 0,
      last_error_message: ''
    }
  });
});

test('createTelegramApiService should call Telegram sendMessage endpoint with chat id and text', async () => {
  const fetchCalls = [];
  const service = createTelegramApiService({
    botToken: 'test-bot-token',
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return createJsonResponse({
        body: {
          ok: true,
          result: {
            message_id: 9
          }
        }
      });
    }
  });

  const result = await service.sendMessage({
    chatId: '123456789',
    text: '服务器全部正常'
  });

  assert.deepEqual(fetchCalls, [
    {
      url: 'https://api.telegram.org/bottest-bot-token/sendMessage',
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: '123456789',
          text: '服务器全部正常'
        })
      }
    }
  ]);
  assert.deepEqual(result, {
    ok: true,
    result: {
      message_id: 9
    }
  });
});
