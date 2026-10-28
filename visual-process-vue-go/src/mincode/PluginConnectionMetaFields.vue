<script setup lang="ts">
import { computed } from 'vue';
import { ElFormItem, ElOption, ElRadioButton, ElRadioGroup, ElSelect } from 'element-plus';
import { ENVIRONMENTS } from './connection-groups.mjs';
import { messages, normalizeLocale } from './messages.mjs';

/** Group and environment of one saved connection; '' = ungrouped / not marked. */
export interface PluginConnectionMeta { group: string; environment: string }

const props = withDefaults(defineProps<{
  modelValue: PluginConnectionMeta;
  groups: readonly string[];
  locale: string;
  /** True for the temporary connection, which has no saved entry to classify. */
  disabled?: boolean;
}>(), { disabled: false });

const emit = defineEmits<{ 'update:modelValue': [value: PluginConnectionMeta] }>();

const copy = computed(() => messages[normalizeLocale(props.locale)]);
const envName = (env: string) => (copy.value as Record<string, string>)[`env_${env}`] ?? env;
const MAX_GROUP_RUNES = 40;
// allow-create accepts free text: keep it to the group rules (trimmed, no control characters, 40 runes).
const cleanGroup = (value: unknown) => [...String(value ?? '').replace(/[\p{Cc}\u2028\u2029]/gu, ' ').trim()].slice(0, MAX_GROUP_RUNES).join('').trim();
function update(patch: Partial<PluginConnectionMeta>) {
  emit('update:modelValue', { group: props.modelValue?.group ?? '', environment: props.modelValue?.environment ?? '', ...patch });
}
</script>

<template>
  <ElFormItem class="plugin-connection-meta__group" :label="copy.groupNameLabel">
    <ElSelect
      :model-value="modelValue?.group ?? ''"
      filterable
      allow-create
      default-first-option
      clearable
      :reserve-keyword="false"
      :disabled="disabled"
      :placeholder="copy.groupNamePlaceholder"
      :aria-label="copy.groupNameLabel"
      popper-class="plugin-select-popper"
      @update:model-value="update({ group: cleanGroup($event) })"
    >
      <ElOption v-for="name in groups" :key="name" :label="name" :value="name" />
    </ElSelect>
  </ElFormItem>
  <ElFormItem class="plugin-connection-meta__environment" :label="copy.envLabel">
    <ElRadioGroup :model-value="modelValue?.environment ?? ''" size="small" :disabled="disabled" :aria-label="copy.envLabel" @update:model-value="update({ environment: String($event ?? '') })">
      <ElRadioButton value="">{{ copy.envNone }}</ElRadioButton>
      <ElRadioButton v-for="env in ENVIRONMENTS" :key="env" :value="env">{{ envName(env) }}</ElRadioButton>
    </ElRadioGroup>
  </ElFormItem>
</template>

<style scoped>
/* Element Plus draws radio-button borders as outlines, outside the box; the 1px inset keeps
   the outer edge (and the selected outline) from being clipped by a scrolling dialog body. */
.plugin-connection-meta__environment :deep(.el-radio-group) { flex-wrap: wrap; padding: 1px; }
</style>
