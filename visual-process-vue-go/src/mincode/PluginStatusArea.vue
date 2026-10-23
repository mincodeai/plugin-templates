<script setup lang="ts">
import { computed } from 'vue';
import { statusMessages } from './status-messages';

const props = defineProps<{ locale: string }>();
const label = computed(() => statusMessages[props.locale.startsWith('zh') ? 'zh' : 'en'].label);
</script>

<template>
  <section class="plugin-status-area" :aria-label="label"><slot /></section>
</template>

<style scoped>
/* Every active notice remains visible. Only the spacing and placement are shared;
   the plugin retains the original conditions, recovery actions and dismissal state. */
.plugin-status-area { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; min-width: 0; flex-shrink: 0; }
.plugin-status-area:empty { display: none; }
.plugin-status-area > :deep(*) { min-width: 0; margin: 0; }
.plugin-status-area > :deep(.el-alert) { align-self: start; }
@media (min-width: 1100px) {
  .plugin-status-area { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  /* Credential forms and recovery actions must not become cramped half-width controls. */
  .plugin-status-area > :deep(:has(.el-button, .el-form, .el-checkbox)),
  .plugin-status-area > :deep(:not(.el-alert)) { grid-column: 1 / -1; }
}
</style>
