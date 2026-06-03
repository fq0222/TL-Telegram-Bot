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
          <input
            v-model="form.password"
            class="field__input"
            type="password"
            placeholder="请输入管理员密码"
          />
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
 * 概述：提供管理员登录页骨架，当前直接调用最小登录接口并保存 token，为后续鉴权守卫接入做准备。
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
 * 提交管理员登录。
 * 核心分支语义：登录成功时保存 token 并跳转概览页；失败时保留在当前页并展示错误信息。
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
    message.value = error instanceof Error ? error.message : '登录失败';
  } finally {
    submitting.value = false;
  }
}
</script>
