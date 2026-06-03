<template>
  <AppShell title="证书管理">
    <div class="view-grid view-grid--two">
      <section class="content-block">
        <h3 class="content-block__title">acme.sh 域名扫描</h3>
        <p class="content-block__text">
          这里会展示从 `~/.acme.sh` 读取到的可用域名，并在选择后复制证书到 `/root/tlboot/域名/`。
        </p>
        <div class="domain-picker">
          <button
            v-for="domain in domains"
            :key="domain"
            class="domain-pill"
            :class="{ 'domain-pill--active': selectedDomain === domain }"
            type="button"
            @click="selectedDomain = domain"
          >
            {{ domain }}
          </button>
        </div>
        <button class="primary-button" type="button" :disabled="!selectedDomain || submitting" @click="handleSelectDomain">
          {{ submitting ? '应用中...' : '启用所选证书' }}
        </button>
      </section>

      <section class="content-block">
        <h3 class="content-block__title">当前启用状态</h3>
        <ul class="content-list">
          <li>证书状态：{{ readyText }}</li>
          <li>当前域名：{{ status.selected_certificate_domain || '未选择' }}</li>
          <li>Fullchain：{{ status.tls_fullchain_path || '未配置' }}</li>
          <li>Privkey：{{ status.tls_privkey_path || '未配置' }}</li>
        </ul>
        <p class="content-block__text">{{ message }}</p>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import {
  fetchCertificateDomains,
  fetchCertificateStatus,
  selectCertificateDomain
} from '../api/admin.js';
import AppShell from '../components/AppShell.vue';

/**
 * 概述：提供证书管理页，负责展示可选域名列表、当前启用状态，并触发证书复制与启用流程。
 */
const domains = ref([]);
const selectedDomain = ref('');
const submitting = ref(false);
const message = ref('请选择一个可用域名以启用证书。');
const status = reactive({
  ready: false,
  selected_certificate_domain: '',
  tls_fullchain_path: '',
  tls_privkey_path: ''
});
const readyText = computed(() => (status.ready ? '已就绪' : '未就绪'));

/**
 * 刷新证书列表与当前状态。
 */
async function loadCertificateData() {
  try {
    const [domainsResponse, statusResponse] = await Promise.all([
      fetchCertificateDomains(),
      fetchCertificateStatus()
    ]);

    domains.value = domainsResponse?.data?.domains || [];
    status.ready = Boolean(statusResponse?.data?.ready);
    status.selected_certificate_domain = statusResponse?.data?.selected_certificate_domain || '';
    status.tls_fullchain_path = statusResponse?.data?.tls_fullchain_path || '';
    status.tls_privkey_path = statusResponse?.data?.tls_privkey_path || '';
    selectedDomain.value = status.selected_certificate_domain || domains.value[0] || '';
  } catch (_error) {
    domains.value = [];
    message.value = '证书信息读取失败，请确认后端服务可用。';
  }
}

/**
 * 选择并启用证书域名。
 */
async function handleSelectDomain() {
  if (!selectedDomain.value) {
    return;
  }

  submitting.value = true;
  message.value = '正在启用所选证书...';

  try {
    const response = await selectCertificateDomain({
      domain: selectedDomain.value
    });

    status.ready = true;
    status.selected_certificate_domain = response?.data?.selected_certificate_domain || selectedDomain.value;
    status.tls_fullchain_path = response?.data?.tls_fullchain_path || '';
    status.tls_privkey_path = response?.data?.tls_privkey_path || '';
    message.value = '证书已复制并设为当前启用状态。';
  } catch (error) {
    message.value = error instanceof Error ? error.message : '证书启用失败。';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadCertificateData();
});
</script>
