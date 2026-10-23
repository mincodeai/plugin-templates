<script setup lang="ts">
import {
  ElAlert,
  ElConfigProvider,
  ElButton,
  ElCard,
  ElDescriptions,
  ElDescriptionsItem,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElScrollbar,
  ElTag,
} from "element-plus";
import PluginStatusArea from "@mincode/plugin-ui/PluginStatusArea.vue";
import { computed, onBeforeUnmount, ref } from "vue";
import enLocale from "element-plus/es/locale/lang/en";
import zhLocale from "element-plus/es/locale/lang/zh-cn";
import { createTransport, type HostContext } from "./transport";

interface GreetingResult {
  message: string;
  receivedAt: string;
  runtime: string;
}

const connected = ref(false);
const busy = ref(false);
const name = ref("MinCode");
const error = ref("");
const result = ref<GreetingResult | null>(null);
const locale = ref("zh");

const copy = computed(() => locale.value.startsWith("zh")
  ? {
      title: "Vue + Go 插件模板",
      subtitle: "Vue 3 + Element Plus 前端，通过受控桥调用独立 Go 进程。",
      connected: "已连接宿主",
      waiting: "等待宿主连接",
      label: "称呼",
      placeholder: "请输入称呼",
      run: "调用 Go 后端",
      empty: "执行操作后，Go 后端返回的结果会显示在这里。",
      runtime: "运行时",
      time: "响应时间",
      failed: "操作失败",
    }
  : {
      title: "Vue + Go Plugin Template",
      subtitle: "Vue 3 + Element Plus calls an isolated Go process through the controlled bridge.",
      connected: "Host connected",
      waiting: "Waiting for host",
      label: "Name",
      placeholder: "Enter a name",
      run: "Call Go backend",
      empty: "Run the action to display the Go backend response.",
      runtime: "Runtime",
      time: "Received",
      failed: "Operation failed",
    });

function applyContext(context: HostContext) {
  const theme = context.theme ?? "light";
  document.documentElement.dataset.theme = theme;
  locale.value = context.locale ?? "zh";
  document.documentElement.lang = locale.value.startsWith("zh") ? "zh-CN" : "en";
}

const transport = createTransport({
  onReady() {
    connected.value = true;
    error.value = "";
  },
  onError(message) {
    connected.value = false;
    error.value = message;
  },
  applyContext,
});

onBeforeUnmount(() => transport.close());

async function greet() {
  if (!connected.value || busy.value) return;
  busy.value = true;
  error.value = "";
  result.value = null;
  try {
    result.value = await transport.call<GreetingResult>("greeting.create", { name: name.value });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : copy.value.failed;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ElConfigProvider :locale="locale.startsWith('zh') ? zhLocale : enLocale">
  <ElScrollbar class="plugin-scrollbar" always>
    <main class="plugin-page">
      <header class="plugin-heading">
        <div>
          <h1>{{ copy.title }}</h1>
          <p>{{ copy.subtitle }}</p>
        </div>
        <ElTag :type="connected ? 'success' : 'warning'">
          {{ connected ? copy.connected : copy.waiting }}
        </ElTag>
      </header>

      <PluginStatusArea :locale="locale">
        <ElAlert
          v-if="error"
          :title="error"
          type="error"
          :closable="false"
          show-icon
        />
      </PluginStatusArea>

      <ElCard shadow="never">
        <ElForm label-position="top" @submit.prevent="greet">
          <ElFormItem :label="copy.label">
            <ElInput v-model="name" :placeholder="copy.placeholder" maxlength="80" show-word-limit />
          </ElFormItem>
          <ElButton type="primary" :loading="busy" :disabled="!connected || !name.trim()" @click="greet">
            {{ copy.run }}
          </ElButton>
        </ElForm>
      </ElCard>

      <ElCard class="result-card" shadow="never">
        <ElEmpty v-if="!result" :description="copy.empty" />
        <ElDescriptions v-else :column="1" border>
          <ElDescriptionsItem :label="copy.runtime">{{ result.runtime }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="copy.time">{{ result.receivedAt }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="copy.title">{{ result.message }}</ElDescriptionsItem>
        </ElDescriptions>
      </ElCard>
    </main>
  </ElScrollbar>
  </ElConfigProvider>
</template>

<style scoped>
.plugin-scrollbar {
  height: 100%;
}

.plugin-page {
  width: min(900px, 100%);
  min-width: 0;
  margin: 0 auto;
  padding: 24px;
}

.plugin-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.plugin-heading h1 {
  margin: 0;
  font-size: 24px;
}

.plugin-heading p {
  margin: 8px 0 0;
  color: var(--app-text-muted);
  line-height: 1.6;
}

.result-card {
  margin-top: 16px;
}

@media (max-width: 640px) {
  .plugin-page {
    padding: 16px;
  }

  .plugin-heading {
    flex-direction: column;
  }
}
</style>
