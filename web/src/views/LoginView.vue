<template>
  <section class="auth-view">
    <div class="auth-view__panel">
      <h1 class="auth-view__title">管理员登录</h1>

      <form class="auth-view__form" @submit.prevent="handleLogin">
        <label class="field">
          <span class="field__label">用户名</span>
          <input v-model="form.username" class="field__input" type="text" placeholder="请输入管理员用户名" />
        </label>
        <label class="field">
          <span class="field__label">密码</span>
          <input v-model="form.password" class="field__input" type="password" placeholder="请输入管理员密码" />
        </label>
        <button class="primary-button" type="submit" :disabled="submitting">
          {{ submitting ? '登录中...' : '进入控制台' }}
        </button>
      </form>

      <p class="auth-view__message" :data-tone="messageTone">{{ message }}</p>
    </div>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { loginAdmin } from '../api/admin.js';
import { setAdminToken } from '../api/http.js';

/**
 * 概述：提供管理员登录页，
 * 当前通过隐藏 API 前缀发起登录，并在命中 30 分钟冷却时展示剩余等待时间。
 */
const router = useRouter();
const form = reactive({
  username: '',
  password: ''
});
const submitting = ref(false);
const message = ref('');
const messageTone = ref('muted');

/**
 * 格式化严格登录冷却提示。
 * @param {{ retryAfterSeconds?: number, retryAt?: string } | null | undefined} details - 服务端返回的冷却详情。
 * @returns {string} 给管理员看的友好提示。
 */
function buildCooldownMessage(details) {
  const retryAfterSeconds =
    details && Number.isInteger(Number(details.retryAfterSeconds)) ? Number(details.retryAfterSeconds) : 0;
  const retryMinutes = retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds / 60) : 30;

  if (details && typeof details.retryAt === 'string' && details.retryAt !== '') {
    return `登录限制已触发，请约 ${retryMinutes} 分钟后重试（解锁时间：${details.retryAt}）。`;
  }

  return `登录限制已触发，请约 ${retryMinutes} 分钟后重试。`;
}

/**
 * 提交管理员登录。
 */
async function handleLogin() {
  submitting.value = true;
  messageTone.value = 'muted';
  message.value = '正在请求管理员登录接口...';

  try {
    const response = await loginAdmin({
      username: form.username,
      password: form.password
    });
    const token = response && response.data ? response.data.token : '';

    if (token) {
      setAdminToken(token);
      messageTone.value = 'success';
      message.value = '登录成功，正在进入控制台。';
      await router.push('/dashboard');
      return;
    }

    throw new Error('登录响应中缺少 token');
  } catch (error) {
    messageTone.value = 'danger';

    if (error && error.statusCode === 429) {
      message.value = buildCooldownMessage(error.details);
    } else {
      message.value = error instanceof Error ? error.message : '登录失败';
    }
  } finally {
    submitting.value = false;
  }
}
</script>
