<template>
  <AppShell title="基础配置">
    <div class="view-grid view-grid--two">
      <form class="content-block content-form" @submit.prevent="handleSave">
        <h3 class="content-block__title">Bot 与内部接口</h3>
        <label class="field field--light">
          <span class="field__label field__label--dark">Telegram Bot Token</span>
          <input v-model="form.telegram_bot_token" class="field__input field__input--light" type="text" />
        </label>
        <label class="field field--light">
          <span class="field__label field__label--dark">Webhook Base URL</span>
          <input v-model="form.webhook_base_url" class="field__input field__input--light" type="text" />
        </label>
        <label class="field field--light">
          <span class="field__label field__label--dark">Webhook Path</span>
          <input v-model="form.webhook_path" class="field__input field__input--light" type="text" />
        </label>
        <label class="field field--light">
          <span class="field__label field__label--dark">Internal API Base URL</span>
          <input v-model="form.internal_api_base_url" class="field__input field__input--light" type="text" />
        </label>
        <label class="field field--light">
          <span class="field__label field__label--dark">Internal API Secret</span>
          <input v-model="form.internal_api_secret" class="field__input field__input--light" type="text" />
        </label>
        <button class="primary-button" type="submit" :disabled="submitting">
          {{ submitting ? '保存中...' : '保存配置' }}
        </button>
        <p class="content-block__text">{{ message }}</p>
      </form>

      <div class="content-block content-form">
        <h3 class="content-block__title">管理员账号安全</h3>
        <form class="content-form" @submit.prevent="handleCredentialSave">
          <label class="field field--light">
            <span class="field__label field__label--dark">登录用户名</span>
            <input v-model="credentialForm.username" class="field__input field__input--light" type="text" />
          </label>
          <label class="field field--light">
            <span class="field__label field__label--dark">当前密码</span>
            <input
              v-model="credentialForm.currentPassword"
              class="field__input field__input--light"
              type="password"
              placeholder="请输入当前登录密码"
            />
          </label>
          <label class="field field--light">
            <span class="field__label field__label--dark">新密码</span>
            <input
              v-model="credentialForm.newPassword"
              class="field__input field__input--light"
              type="password"
              placeholder="请输入新的管理员密码"
            />
          </label>
          <label class="field field--light">
            <span class="field__label field__label--dark">确认新密码</span>
            <input
              v-model="credentialForm.confirmPassword"
              class="field__input field__input--light"
              type="password"
              placeholder="请再次输入新密码"
            />
          </label>
          <button class="primary-button" type="submit" :disabled="credentialSubmitting">
            {{ credentialSubmitting ? '更新中...' : '更新登录凭据' }}
          </button>
          <p class="content-block__text">{{ credentialMessage }}</p>
        </form>

        <h3 class="content-block__title">当前配置快照</h3>
        <pre class="content-block__code">{{ serializedConfig }}</pre>
      </div>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import {
  fetchAdminCredentials,
  fetchConfig,
  saveConfig as saveConfigRequest,
  updateAdminCredentials as updateAdminCredentialsRequest
} from '../api/admin.js';
import AppShell from '../components/AppShell.vue';

/**
 * 概述：提供管理员基础配置页，负责展示并保存 Bot、Webhook 与内部接口相关配置。
 */
const form = reactive({
  telegram_bot_token: '',
  webhook_path: '',
  webhook_base_url: '',
  internal_api_base_url: '',
  internal_api_secret: '',
  selected_certificate_domain: '',
  tls_fullchain_path: '',
  tls_privkey_path: ''
});
const submitting = ref(false);
const message = ref('读取配置后即可在这里编辑并保存。');
const credentialForm = reactive({
  username: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
});
const credentialSubmitting = ref(false);
const credentialMessage = ref('管理员登录名与密码将保存到当前项目的 SQLite 配置中。');
const serializedConfig = computed(() => JSON.stringify(form, null, 2));

/**
 * 把接口配置快照回填到表单。
 * @param {Record<string, string>} config - 配置快照。
 */
function applyConfig(config = {}) {
  Object.keys(form).forEach((key) => {
    form[key] = typeof config[key] === 'string' ? config[key] : '';
  });
}

/**
 * 加载当前配置。
 */
async function loadConfig() {
  try {
    const response = await fetchConfig();

    applyConfig(response?.data?.config || {});
    message.value = '当前显示的是服务端最新配置快照。';
  } catch (_error) {
    message.value = '读取配置失败，请确认已经登录。';
  }
}

/**
 * 加载当前管理员用户名，用于凭据修改表单回显。
 */
async function loadAdminCredentials() {
  try {
    const response = await fetchAdminCredentials();

    credentialForm.username = response?.data?.username || '';
  } catch (_error) {
    credentialMessage.value = '当前管理员用户名读取失败，请确认登录状态后重试。';
  }
}

/**
 * 保存配置。
 * 核心分支语义：保存成功后回填服务端返回快照；保存失败时保留当前输入，便于管理员继续修改。
 */
async function handleSave() {
  submitting.value = true;
  message.value = '正在保存配置...';

  try {
    const response = await saveConfigRequest({ ...form });

    applyConfig(response?.data?.config || {});
    message.value = '配置保存成功。';
  } catch (error) {
    message.value = error instanceof Error ? error.message : '配置保存失败。';
  } finally {
    submitting.value = false;
  }
}

/**
 * 更新管理员登录用户名与密码。
 * 核心分支语义：前端先校验确认密码；服务端更新成功后清空密码输入，避免凭据继续停留在页面内存中。
 */
async function handleCredentialSave() {
  if (!credentialForm.username.trim()) {
    credentialMessage.value = '请输入新的管理员用户名。';
    return;
  }

  if (!credentialForm.currentPassword || !credentialForm.newPassword) {
    credentialMessage.value = '请输入当前密码和新密码。';
    return;
  }

  if (credentialForm.newPassword !== credentialForm.confirmPassword) {
    credentialMessage.value = '两次输入的新密码不一致，请重新确认。';
    return;
  }

  credentialSubmitting.value = true;
  credentialMessage.value = '正在更新管理员登录凭据...';

  try {
    const response = await updateAdminCredentialsRequest({
      username: credentialForm.username.trim(),
      currentPassword: credentialForm.currentPassword,
      newPassword: credentialForm.newPassword
    });

    credentialForm.username = response?.data?.username || credentialForm.username.trim();
    credentialForm.currentPassword = '';
    credentialForm.newPassword = '';
    credentialForm.confirmPassword = '';
    credentialMessage.value = '管理员登录凭据更新成功，下次登录请使用新账号信息。';
  } catch (error) {
    credentialMessage.value = error instanceof Error ? error.message : '管理员登录凭据更新失败。';
  } finally {
    credentialSubmitting.value = false;
  }
}

onMounted(() => {
  loadConfig();
  loadAdminCredentials();
});
</script>
