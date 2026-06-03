/**
 * 概述：覆盖服务启动配置读取优先级，重点验证 TLS 路径优先读取数据库配置，缺失时回退环境变量。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { loadServerEnv } = require('../src/config/env');

test('loadServerEnv 优先读取数据库中的 TLS 路径配置', () => {
  const runtimeEnv = loadServerEnv({
    env: {
      APP_HOST: '::',
      APP_PORT: '443',
      TLS_FULLCHAIN_PATH: '/env/fullchain.pem',
      TLS_PRIVKEY_PATH: '/env/privkey.pem',
      NODE_ENV: 'production'
    },
    configService: {
      getConfigsSync(keys) {
        assert.deepEqual(keys, ['tls_fullchain_path', 'tls_privkey_path']);
        return {
          tls_fullchain_path: '/db/fullchain.pem',
          tls_privkey_path: '/db/privkey.pem'
        };
      }
    }
  });

  assert.deepEqual(runtimeEnv, {
    host: '::',
    port: 443,
    tlsFullchainPath: '/db/fullchain.pem',
    tlsPrivkeyPath: '/db/privkey.pem',
    nodeEnv: 'production'
  });
});

test('loadServerEnv 在数据库 TLS 路径缺失时回退环境变量', () => {
  const runtimeEnv = loadServerEnv({
    env: {
      APP_HOST: '0.0.0.0',
      APP_PORT: '8443',
      TLS_FULLCHAIN_PATH: '/env/fallback-fullchain.pem',
      TLS_PRIVKEY_PATH: '/env/fallback-privkey.pem',
      NODE_ENV: 'production'
    },
    configService: {
      getConfigsSync() {
        return {
          tls_fullchain_path: '',
          tls_privkey_path: ''
        };
      }
    }
  });

  assert.deepEqual(runtimeEnv, {
    host: '0.0.0.0',
    port: 8443,
    tlsFullchainPath: '/env/fallback-fullchain.pem',
    tlsPrivkeyPath: '/env/fallback-privkey.pem',
    nodeEnv: 'production'
  });
});
