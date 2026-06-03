/**
 * 概述：Task 4 的内部接口签名测试，覆盖签名原文、HMAC 签名格式，以及内部客户端注入签名请求头的最小行为。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { buildSignaturePayload, signRequest } = require('../src/utils/signature');
const { createInternalApiService } = require('../src/services/internal-api-service');

test('buildSignaturePayload should concatenate method path timestamp and rawBody in stable order', () => {
  const payload = buildSignaturePayload({
    method: 'post',
    path: '/internal/webhook',
    timestamp: '1717400000',
    rawBody: '{"chatId":1}'
  });

  assert.equal(payload, 'POST\n/internal/webhook\n1717400000\n{"chatId":1}');
});

test('signRequest should return 64-character lowercase hex hmac signature', () => {
  const signature = signRequest({
    secret: 'task4-secret',
    method: 'POST',
    path: '/internal/webhook',
    timestamp: '1717400000',
    rawBody: '{"chatId":1}'
  });
  const expectedSignature = crypto
    .createHmac('sha256', 'task4-secret')
    .update('POST\n/internal/webhook\n1717400000\n{"chatId":1}')
    .digest('hex');

  assert.equal(signature, expectedSignature);
  assert.match(signature, /^[0-9a-f]{64}$/);
});

test('createInternalApiService should call fetchImpl and inject internal signature headers', async () => {
  const fetchCalls = [];
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null;
        }
      },
      async json() {
        return { success: true };
      }
    };
  };
  const service = createInternalApiService({
    baseUrl: 'https://bot.example.com',
    secret: 'task4-secret',
    fetchImpl,
    now() {
      return 1717400000;
    }
  });

  const response = await service.request({
    method: 'post',
    path: '/internal/webhook',
    body: {
      updateId: 1001
    }
  });

  assert.deepEqual(response, { success: true });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://bot.example.com/internal/webhook');
  assert.equal(fetchCalls[0].options.method, 'POST');
  assert.equal(fetchCalls[0].options.body, '{"updateId":1001}');
  assert.equal(fetchCalls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(fetchCalls[0].options.headers['X-Internal-Client'], 'telegram-bot');
  assert.equal(fetchCalls[0].options.headers['X-Internal-Timestamp'], '1717400000');
  assert.equal(
    fetchCalls[0].options.headers['X-Internal-Signature'],
    crypto
      .createHmac('sha256', 'task4-secret')
      .update('POST\n/internal/webhook\n1717400000\n{"updateId":1001}')
      .digest('hex')
  );
});

test('createInternalApiService should return null for 204 empty response', async () => {
  const service = createInternalApiService({
    baseUrl: 'https://bot.example.com',
    secret: 'task4-secret',
    fetchImpl: async () => ({
      ok: true,
      status: 204,
      headers: {
        get() {
          return null;
        }
      },
      async json() {
        throw new Error('json should not be called');
      },
      async text() {
        throw new Error('text should not be called');
      }
    })
  });

  const response = await service.request({
    method: 'GET',
    path: '/internal/health'
  });

  assert.equal(response, null);
});

test('createInternalApiService should throw error with status and text summary for non-2xx text response', async () => {
  const service = createInternalApiService({
    baseUrl: 'https://bot.example.com',
    secret: 'task4-secret',
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      headers: {
        get(name) {
          return String(name).toLowerCase() === 'content-type' ? 'text/plain; charset=utf-8' : null;
        }
      },
      async json() {
        throw new Error('json should not be called');
      },
      async text() {
        return 'upstream gateway error';
      }
    })
  });

  await assert.rejects(
    () =>
      service.request({
        method: 'GET',
        path: '/internal/health'
      }),
    (error) => {
      assert.equal(error.status, 502);
      assert.match(error.message, /502/);
      assert.match(error.message, /upstream gateway error/);
      return true;
    }
  );
});

test('createInternalApiService should preserve unified error when non-2xx text body reading fails', async () => {
  const service = createInternalApiService({
    baseUrl: 'https://bot.example.com',
    secret: 'task4-secret',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      headers: {
        get(name) {
          return String(name).toLowerCase() === 'content-type' ? 'text/plain; charset=utf-8' : null;
        }
      },
      async text() {
        throw new Error('stream closed unexpectedly');
      }
    })
  });

  await assert.rejects(
    () =>
      service.request({
        method: 'GET',
        path: '/internal/failing-text'
      }),
    (error) => {
      assert.equal(error.status, 503);
      assert.match(error.message, /503/);
      assert.match(error.message, /failed to read response body|stream closed unexpectedly/);
      return true;
    }
  );
});

test('createInternalApiService should preserve unified error for non-2xx invalid json response body', async () => {
  const service = createInternalApiService({
    baseUrl: 'https://bot.example.com',
    secret: 'task4-secret',
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      headers: {
        get(name) {
          return String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null;
        }
      },
      async json() {
        throw new Error('Unexpected end of JSON input');
      },
      async text() {
        return '{"broken":';
      }
    })
  });

  await assert.rejects(
    () =>
      service.request({
        method: 'GET',
        path: '/internal/failing-json'
      }),
    (error) => {
      assert.equal(error.status, 500);
      assert.match(error.message, /500/);
      assert.match(error.message, /invalid json response body|{"broken":/);
      return true;
    }
  );
});

test('createInternalApiService should sign empty body as empty string and omit content-type when body is missing', async () => {
  const fetchCalls = [];
  const service = createInternalApiService({
    baseUrl: 'https://bot.example.com',
    secret: 'task4-secret',
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            return String(name).toLowerCase() === 'content-type' ? 'application/json' : null;
          }
        },
        async json() {
          return { success: true };
        }
      };
    },
    now() {
      return 1717400001;
    }
  });

  await service.request({
    method: 'GET',
    path: '/internal/health'
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options.body, undefined);
  assert.equal(fetchCalls[0].options.headers['Content-Type'], undefined);
  assert.equal(
    fetchCalls[0].options.headers['X-Internal-Signature'],
    crypto.createHmac('sha256', 'task4-secret').update('GET\n/internal/health\n1717400001\n').digest('hex')
  );
});

test('createInternalApiService should use provided rawBody for both signature and sent request body', async () => {
  const fetchCalls = [];
  const service = createInternalApiService({
    baseUrl: 'https://bot.example.com',
    secret: 'task4-secret',
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            return String(name).toLowerCase() === 'content-type' ? 'text/plain; charset=utf-8' : null;
          }
        },
        async text() {
          return 'accepted';
        }
      };
    },
    now() {
      return 1717400002;
    }
  });

  const response = await service.request({
    method: 'POST',
    path: '/internal/raw',
    rawBody: 'plain-text-body',
    headers: {
      'Content-Type': 'text/plain'
    },
    parseAs: 'text'
  });

  assert.equal(response, 'accepted');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options.body, 'plain-text-body');
  assert.equal(fetchCalls[0].options.headers['Content-Type'], 'text/plain');
  assert.equal(
    fetchCalls[0].options.headers['X-Internal-Signature'],
    crypto.createHmac('sha256', 'task4-secret').update('POST\n/internal/raw\n1717400002\nplain-text-body').digest('hex')
  );
});
