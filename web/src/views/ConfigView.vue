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

      <section class="content-block">
        <h3 class="content-block__title">当前配置快照</h3>
        <pre class="content-block__code">{{ serializedConfig }}</pre>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { fetchConfig, saveConfig as saveConfigRequest } from '../api/admin.js';
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

onMounted(() => {
  loadConfig();
});
</script>
