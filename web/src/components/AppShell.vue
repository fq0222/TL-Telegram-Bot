<template>
  <div class="shell">
    <aside class="shell__sidebar">
      <p class="shell__eyebrow">TL Telegram Bot</p>
      <h1 class="shell__title">管理员控制台</h1>
      <p class="shell__intro">
        这里负责 Bot 一期的配置、证书选择与 Webhook 管理，当前页面先提供稳定的管理骨架。
      </p>
      <nav class="shell__nav">
        <RouterLink
          v-for="item in navigationItems"
          :key="item.to"
          :to="item.to"
          class="shell__link"
          :class="{ 'shell__link--active': route.path === item.to }"
        >
          <span class="shell__link-label">{{ item.label }}</span>
          <span class="shell__link-note">{{ item.note }}</span>
        </RouterLink>
      </nav>
    </aside>

    <main class="shell__content">
      <header class="shell__header">
        <div>
          <p class="shell__header-kicker">{{ kicker }}</p>
          <h2 class="shell__header-title">{{ title }}</h2>
        </div>
        <slot name="header-extra" />
      </header>
      <section class="shell__panel">
        <slot />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

/**
 * 概述：提供管理员端公共外壳布局，统一侧边导航、标题区和内容面板，减少各页面重复结构。
 */
defineProps({
  title: {
    type: String,
    required: true
  },
  kicker: {
    type: String,
    default: 'TLBOT / PHASE 1'
  }
});

const route = useRoute();
const navigationItems = computed(() => [
  { to: '/dashboard', label: '运行概览', note: '状态和骨架卡片' },
  { to: '/config', label: '基础配置', note: 'Bot 与内部 API 配置' },
  { to: '/certificates', label: '证书管理', note: 'acme.sh 域名与 TLS 证书' },
  { to: '/webhook', label: 'Webhook', note: '回调地址与注册流程' }
]);
</script>
