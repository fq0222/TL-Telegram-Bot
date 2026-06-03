<template>
  <AppShell title="Webhook 管理">
    <div class="view-grid view-grid--two">
      <section class="content-block">
        <h3 class="content-block__title">回调入口</h3>
        <p class="content-block__text">当前服务端会根据配置中的 Base URL 与 Path 拼接最终 Webhook 地址。</p>
        <p class="content-block__text">当前地址：{{ webhookUrl || '尚未生成' }}</p>
        <button class="primary-button" type="button" :disabled="submitting" @click="handleRegisterWebhook">
          {{ submitting ? '注册中...' : '注册 Webhook' }}
        </button>
      </section>
      <section class="content-block">
        <h3 class="content-block__title">运行提示</h3>
        <ul class="content-list">
          <li>服务会优先尝试以 HTTPS 监听 443。</li>
          <li>证书未就绪时会降级为 HTTP，便于管理员继续配置。</li>
          <li>注册前请先确认 `webhook_base_url` 与 `webhook_path` 已保存。</li>
        </ul>
        <p class="content-block__text">{{ message }}</p>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { fetchOverview, registerWebhook } from '../api/admin.js';
import AppShell from '../components/AppShell.vue';

/**
 * 概述：提供 Webhook 管理页，负责展示当前拼接后的 Webhook 地址并触发注册动作。
 */
const webhookUrl = ref('');
const submitting = ref(false);
const message = ref('请先在基础配置页确认 Webhook Base URL 与 Path。');

/**
 * 加载当前 Webhook 地址。
 */
async function loadWebhookOverview() {
  try {
    const response = await fetchOverview();

    webhookUrl.value = response?.data?.webhook_url || '';
  } catch (_error) {
    webhookUrl.value = '';
  }
}

/**
 * 注册 Webhook。
 */
async function handleRegisterWebhook() {
  submitting.value = true;
  message.value = '正在注册 Telegram Webhook...';

  try {
    const response = await registerWebhook();

    webhookUrl.value = response?.data?.webhook_url || '';
    message.value = response?.data?.registered ? 'Webhook 注册成功。' : 'Webhook 尚未注册，请先补全配置。';
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Webhook 注册失败。';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadWebhookOverview();
});
</script>
