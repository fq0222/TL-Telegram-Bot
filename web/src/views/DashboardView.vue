<template>
  <AppShell title="运行概览">
    <div class="view-grid view-grid--three">
      <StatusCard label="管理员状态" :value="adminStatus" description="当前来自最小状态骨架接口。" />
      <StatusCard label="证书模块" :value="certificateStatus" description="后续会替换成真实 TLS 可用性。" />
      <StatusCard label="Webhook 接入" value="待注册" description="当前已具备回调骨架，后续补注册动作。" />
    </div>

    <section class="content-block">
      <h3 class="content-block__title">阶段说明</h3>
      <p class="content-block__text">
        这一页会优先展示 Bot 服务状态、证书启用情况、Webhook 注册结果和内部接口健康度。现在先用骨架数据把信息层级搭好。
      </p>
    </section>
  </AppShell>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { fetchCertificateStatus, fetchStatus } from '../api/admin.js';
import AppShell from '../components/AppShell.vue';
import StatusCard from '../components/StatusCard.vue';

/**
 * 概述：提供管理员概览页骨架，聚合最小状态接口与卡片化展示，后续用于接入真实状态数据。
 */
const adminStatus = ref('加载中');
const certificateStatus = ref('加载中');

/**
 * 拉取最小状态信息。
 * 核心分支语义：接口成功时展示骨架字段；失败时回退到“待登录/待配置”提示，保证页面不会空白。
 */
async function loadOverview() {
  try {
    const [statusResponse, certificateResponse] = await Promise.all([
      fetchStatus(),
      fetchCertificateStatus()
    ]);

    adminStatus.value =
      statusResponse && statusResponse.data && statusResponse.data.status
        ? statusResponse.data.status
        : '未知';
    certificateStatus.value =
      certificateResponse && certificateResponse.data && typeof certificateResponse.data.ready === 'boolean'
        ? certificateResponse.data.ready
          ? '已就绪'
          : '未就绪'
        : '未知';
  } catch (_error) {
    adminStatus.value = '待登录';
    certificateStatus.value = '待配置';
  }
}

onMounted(() => {
  loadOverview();
});
</script>
