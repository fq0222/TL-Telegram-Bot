<template>
  <AppShell title="证书管理">
    <div class="view-grid view-grid--two">
      <section class="content-block">
        <h3 class="content-block__title">acme.sh 域名扫描</h3>
        <p class="content-block__text">
          这里将展示从 `~/.acme.sh` 读取到的可用域名，并允许管理员选择复制到 `/root/tlboot/域名/`。
        </p>
        <ul class="content-list">
          <li>来源目录：`~/.acme.sh`</li>
          <li>目标目录：`/root/tlboot/&lt;domain&gt;/`</li>
          <li>目标文件：`fullchain.pem` 与 `privkey.pem`</li>
        </ul>
      </section>

      <section class="content-block">
        <h3 class="content-block__title">当前状态骨架</h3>
        <p class="content-block__text">
          证书就绪状态：<strong>{{ readyText }}</strong>
        </p>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { fetchCertificateStatus } from '../api/admin.js';
import AppShell from '../components/AppShell.vue';

/**
 * 概述：提供证书管理页骨架，当前先承载证书来源/目标规则说明与最小状态展示。
 */
const ready = ref(false);
const readyText = computed(() => (ready.value ? '已就绪' : '未就绪'));

/**
 * 拉取证书骨架状态。
 * 核心分支语义：成功时读取 `ready` 字段；失败时默认保持未就绪，提示管理员仍需完成证书配置。
 */
async function loadCertificateStatus() {
  try {
    const response = await fetchCertificateStatus();

    ready.value = Boolean(response && response.data && response.data.ready);
  } catch (_error) {
    ready.value = false;
  }
}

onMounted(() => {
  loadCertificateStatus();
});
</script>
