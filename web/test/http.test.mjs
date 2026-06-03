/**
 * 概述：覆盖管理员前端 HTTP 客户端在 401 未授权场景下的退出登录与跳转行为，
 * 确保隐藏路径模式下会话过期后也能清理本地 token 并返回秘密登录页。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

test('http client should clear admin token and redirect to hidden login route on 401 response', async () => {
  const storage = new Map([['tl-telegram-bot-admin-token', 'expired-token']]);
  const secretBasePath = '/0123456789abcdef0123456789abcdef';
  const locationState = {
    pathname: `${secretBasePath}/config`,
    href: `${secretBasePath}/config`
  };

  global.window = {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      }
    },
    location: {
      get pathname() {
        return locationState.pathname;
      },
      set pathname(value) {
        locationState.pathname = value;
      },
      get href() {
        return locationState.href;
      },
      set href(value) {
        locationState.href = value;
        locationState.pathname = value;
      }
    }
  };

  global.fetch = async () => ({
    ok: false,
    status: 401,
    async json() {
      return {
        code: 401,
        message: '未授权访问',
        data: null
      };
    }
  });

  const { http, getAdminToken } = await import(`../src/api/http.js?test=${Date.now()}`);

  await assert.rejects(() => http.get('/config'), /未授权访问/);
  assert.equal(getAdminToken(), '');
  assert.equal(locationState.href, `${secretBasePath}/login`);
});
