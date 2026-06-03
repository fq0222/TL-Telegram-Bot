<template>
  <AppShell title="Webhook 管理">
    <div class="view-grid view-grid--two">
      <section class="content-block">
        <h3 class="content-block__title">回调入口</h3>
        <p class="content-block__text">
          当前后端已经具备 `POST /telegram/webhook` 骨架，后续这里会承接 Webhook URL 生成、注册和重试状态。
        </p>
      </section>
      <section class="content-block">
        <h3 class="content-block__title">运行提示</h3>
        <ul class="content-list">
          <li>服务会优先尝试以 HTTPS 监听 443。</li>
          <li>证书未就绪时会降级为 HTTP，便于管理员继续配置。</li>
          <li>正式注册前需要先确认公网域名和证书路径。</li>
        </ul>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
/**
 * 概述：提供 Webhook 管理页骨架，用于承载回调地址、注册动作与运行状态说明。
 */
</script>
