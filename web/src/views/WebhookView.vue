<template>
  <AppShell title="Webhook 管理">
    <div class="view-grid view-grid--two">
      <section class="content-block">
        <h3 class="content-block__title">回调入口</h3>
        <p class="content-block__text">当前服务端会根据配置中的 Base URL 与 Path 拼接最终 Webhook 地址。</p>
        <p class="content-block__text">当前地址：{{ webhookUrl || '尚未生成' }}</p>
        <p class="content-block__text">当前注册：{{ webhookRegistered ? '已注册' : '未注册' }}</p>
        <button class="primary-button" type="button" :disabled="submitting" @click="handleRegisterWebhook">
          {{ submitting ? '注册中...' : '注册 Webhook' }}
        </button>
      </section>
      <section class="content-block">
        <h3 class="content-block__title">运行提示</h3>
        <ul class="content-list">
          <li>服务会优先尝试以 HTTPS 监听 443。</li>
          <li>注册前请先确认 `webhook_base_url`、`webhook_path` 与 `telegram_bot_token` 已保存。</li>
          <li>待处理更新数：{{ pendingUpdateCount }}</li>
          <li>最近错误：{{ lastErrorMessage || '无' }}</li>
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
 * 概述：提供 Webhook 管理页，负责展示当前拼接后的 Webhook 地址、Telegram 注册状态并触发真实注册动作。
 */
const webhookUrl = ref('');
const webhookRegistered = ref(false);
const pendingUpdateCount = ref(0);
const lastErrorMessage = ref('');
const submitting = ref(false);
const message = ref('请先在基础配置页确认 Webhook Base URL、Path 和 Telegram Bot Token。');

/**
 * 加载当前 Webhook 概览。
 */
async function loadWebhookOverview() {
  try {
    const response = await fetchOverview();

    webhookUrl.value = response?.data?.webhook_url || '';
    webhookRegistered.value = Boolean(response?.data?.webhook_registered);
    pendingUpdateCount.value = Number(response?.data?.webhook_pending_update_count || 0);
    lastErrorMessage.value = response?.data?.webhook_last_error_message || '';
  } catch (_error) {
    webhookUrl.value = '';
    webhookRegistered.value = false;
    pendingUpdateCount.value = 0;
    lastErrorMessage.value = '';
  }
}

/**
 * 注册 Webhook。
 * 核心分支语义：成功时回填最新注册状态；失败时展示服务端返回的真实错误，便于直接排查 Telegram 接口问题。
 */
async function handleRegisterWebhook() {
  submitting.value = true;
  message.value = '正在注册 Telegram Webhook...';

  try {
    const response = await registerWebhook();
    const telegramDescription = response?.data?.telegram_result?.description || '';

    await loadWebhookOverview();
    message.value = response?.data?.registered
      ? `Webhook 注册成功${telegramDescription ? `：${telegramDescription}` : '。'}`
      : 'Webhook 尚未注册，请先补全配置。';
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
