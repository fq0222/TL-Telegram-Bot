<template>
  <AppShell title="基础配置">
    <div class="view-grid view-grid--two">
      <section class="content-block">
        <h3 class="content-block__title">Bot 与内部接口</h3>
        <p class="content-block__text">
          这里会配置 Telegram Bot Token、Webhook Path、内部 API Base URL 和签名 Secret。当前阶段先保留字段布局与说明文案。
        </p>
      </section>
      <section class="content-block">
        <h3 class="content-block__title">当前骨架返回</h3>
        <pre class="content-block__code">{{ serializedConfig }}</pre>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { fetchConfig } from '../api/admin.js';
import AppShell from '../components/AppShell.vue';

/**
 * 概述：提供管理员基础配置页骨架，用于承接系统配置字段与当前配置接口的最小返回。
 */
const config = ref({});
const serializedConfig = computed(() => JSON.stringify(config.value, null, 2));

/**
 * 加载当前配置骨架。
 * 核心分支语义：成功时展示接口返回；失败时展示空对象，避免页面报错阻断后续布局开发。
 */
async function loadConfig() {
  try {
    const response = await fetchConfig();

    config.value = response && response.data && response.data.config ? response.data.config : {};
  } catch (_error) {
    config.value = {};
  }
}

onMounted(() => {
  loadConfig();
});
</script>
