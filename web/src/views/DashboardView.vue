<template>
  <AppShell title="运行概览">
    <div class="view-grid view-grid--three">
      <StatusCard label="管理员状态" :value="adminStatus" description="来自管理员状态接口的当前阶段标识。" />
      <StatusCard label="证书模块" :value="certificateStatus" description="根据已选证书路径判断当前 TLS 是否就绪。" />
      <StatusCard label="Webhook 地址" :value="webhookStatus" description="这里会展示最终拼接出的 Telegram 回调地址。" />
    </div>

    <section class="content-block">
      <h3 class="content-block__title">当前一期概览</h3>
      <ul class="content-list">
        <li>已选证书域名：{{ overview.selected_certificate_domain || '未选择' }}</li>
        <li>TLS Fullchain：{{ overview.tls_fullchain_path || '未配置' }}</li>
        <li>TLS Privkey：{{ overview.tls_privkey_path || '未配置' }}</li>
        <li>Webhook URL：{{ overview.webhook_url || '未生成' }}</li>
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
 * 概述：提供管理员概览页，聚合状态接口与概览接口结果，集中展示当前证书与 Webhook 的打通状态。
 */
const adminStatus = ref('加载中');
const overview = reactive({
  webhook_url: '',
  selected_certificate_domain: '',
  tls_fullchain_path: '',
  tls_privkey_path: '',
  certificate_ready: false
});
const message = ref('正在读取当前管理员概览...');

const certificateStatus = computed(() => (overview.certificate_ready ? '已就绪' : '未就绪'));
const webhookStatus = computed(() => overview.webhook_url || '待生成');

/**
 * 拉取概览数据。
 * 核心分支语义：成功时更新概览卡片和详细字段；失败时回退到待登录提示，避免页面进入空白状态。
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
    message.value = '概览已刷新，可继续前往配置、证书和 Webhook 页面完成剩余设置。';
  } catch (_error) {
    adminStatus.value = '待登录';
    message.value = '读取概览失败，请先在登录页获取管理员 token。';
  }
}

onMounted(() => {
  loadOverview();
});
</script>
