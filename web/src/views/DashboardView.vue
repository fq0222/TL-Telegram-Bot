<template>
  <AppShell title="运行概览">
    <div class="view-grid view-grid--three">
      <StatusCard label="管理员状态" :value="adminStatus" description="聚合证书、Token 与 Telegram Webhook 注册结果。" />
      <StatusCard label="证书模块" :value="certificateStatus" description="根据当前已保存的证书路径判断是否已完成证书选择。" />
      <StatusCard label="Webhook 状态" :value="webhookStatus" description="展示当前配置的回调地址是否已经在 Telegram 侧注册成功。" />
    </div>

    <section class="content-block">
      <h3 class="content-block__title">当前运行快照</h3>
      <ul class="content-list">
        <li>已选证书域名：{{ overview.selected_certificate_domain || '未选择' }}</li>
        <li>TLS Fullchain：{{ overview.tls_fullchain_path || '未配置' }}</li>
        <li>TLS Privkey：{{ overview.tls_privkey_path || '未配置' }}</li>
        <li>Webhook URL：{{ overview.webhook_url || '未生成' }}</li>
        <li>Bot Token：{{ overview.telegram_bot_token_configured ? '已配置' : '未配置' }}</li>
        <li>Webhook 注册：{{ overview.webhook_registered ? '已注册' : '未注册' }}</li>
        <li>待处理更新数：{{ overview.webhook_pending_update_count }}</li>
        <li>Webhook 最近错误：{{ overview.webhook_last_error_message || '无' }}</li>
      </ul>
      <p class="content-block__text">{{ message }}</p>
    </section>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { fetchOverview, fetchStatus } from '../api/admin.js';
import AppShell from '../components/AppShell.vue';
import StatusCard from '../components/StatusCard.vue';

/**
 * 概述：提供管理员概览页，聚合状态接口与概览接口结果，集中展示当前证书与 Webhook 的真实打通状态。
 */
const adminStatus = ref('加载中');
const overview = reactive({
  webhook_url: '',
  selected_certificate_domain: '',
  tls_fullchain_path: '',
  tls_privkey_path: '',
  certificate_ready: false,
  telegram_bot_token_configured: false,
  webhook_registered: false,
  webhook_pending_update_count: 0,
  webhook_last_error_message: ''
});
const message = ref('正在读取当前管理员概览...');

const certificateStatus = computed(() => (overview.certificate_ready ? '已就绪' : '未就绪'));
const webhookStatus = computed(() => {
  if (!overview.webhook_url) {
    return '未生成';
  }

  return overview.webhook_registered ? '已注册' : '待注册';
});

/**
 * 拉取概览数据。
 * 核心分支语义：成功时同时刷新真实状态摘要与概览字段；失败时给出待登录提示，避免页面停在旧状态。
 */
async function loadOverview() {
  try {
    const [statusResponse, overviewResponse] = await Promise.all([fetchStatus(), fetchOverview()]);

    adminStatus.value = statusResponse?.data?.status || '未知';
    overview.webhook_url = overviewResponse?.data?.webhook_url || '';
    overview.selected_certificate_domain = overviewResponse?.data?.selected_certificate_domain || '';
    overview.tls_fullchain_path = overviewResponse?.data?.tls_fullchain_path || '';
    overview.tls_privkey_path = overviewResponse?.data?.tls_privkey_path || '';
    overview.certificate_ready = Boolean(overviewResponse?.data?.certificate_ready);
    overview.telegram_bot_token_configured = Boolean(overviewResponse?.data?.telegram_bot_token_configured);
    overview.webhook_registered = Boolean(overviewResponse?.data?.webhook_registered);
    overview.webhook_pending_update_count = Number(overviewResponse?.data?.webhook_pending_update_count || 0);
    overview.webhook_last_error_message = overviewResponse?.data?.webhook_last_error_message || '';

    if (adminStatus.value === 'ready') {
      message.value = 'Webhook、证书和 Bot Token 已经对齐，可以直接用于真实 Telegram 调用。';
      return;
    }

    if (adminStatus.value === 'degraded') {
      message.value = overview.webhook_last_error_message || '基础配置已存在，但 Telegram 侧的 Webhook 还没有完全就绪。';
      return;
    }

    message.value = '当前仍有基础配置未完成，可以继续在配置、证书和 Webhook 页面补齐。';
  } catch (_error) {
    adminStatus.value = '待登录';
    message.value = '读取概览失败，请先在登录页获取管理员 token。';
  }
}

onMounted(() => {
  loadOverview();
});
</script>
