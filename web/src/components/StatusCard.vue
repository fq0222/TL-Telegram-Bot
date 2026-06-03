<template>
  <article class="status-card">
    <p class="status-card__label">{{ label }}</p>
    <h3 class="status-card__value">{{ value }}</h3>
    <p class="status-card__description">{{ description }}</p>
  </article>
</template>

<script setup>
/**
 * 概述：提供仪表盘状态卡片组件，统一展示标签、主值与补充说明，便于后续接入真实状态数据。
 */
defineProps({
  label: {
    type: String,
    required: true
  },
  value: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  }
});
</script>
