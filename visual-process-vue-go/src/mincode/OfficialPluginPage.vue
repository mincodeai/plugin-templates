<script setup>
import { computed, onUnmounted, provide, reactive, ref, watch } from 'vue';
import { ElConfigProvider, ElScrollbar, ElAlert, ElButton, ElCheckbox, ElEmpty, ElForm, ElFormItem, ElInput, ElTag, ElCollapse, ElCollapseItem } from 'element-plus';
import enLocale from 'element-plus/es/locale/lang/en';
import zhLocale from 'element-plus/es/locale/lang/zh-cn';
import { normalizeLocale, pluginMessages, pluginLocaleKey } from './messages.mjs';
import PluginTaskPanel from './PluginTaskPanel.vue';
import { taskMessagesEn, taskMessagesZh } from './task-messages';
import { createTransport } from './transport.js';
import { buildPayload } from './form-payload.mjs';
import { pathFieldKind, relativeProjectPath } from './path-fields.mjs';
const props = defineProps({ config: { type: Object, required: true }, policy: { type: Object, default: () => ({}) } });
const values = reactive(Object.fromEntries(props.config.fields.map(field => [field.id, field.type === 'boolean' ? field.default === true : field.default ?? ''])));
const connected = ref(false), busy = ref(false), error = ref(''), result = ref(null), activeAction = ref(''), elapsed = ref(0), completed = ref('');
const taskUncertain = ref(false);
const locale = ref('zh'), longTask = ref(false), taskRun = ref(null);
provide(pluginLocaleKey, locale);
const copy = computed(() => pluginMessages(locale.value));
const logoLetter = computed(() => props.config.title?.trim()?.charAt(0) || 'P');
const taskCopy = computed(() => locale.value === 'zh' ? taskMessagesZh : taskMessagesEn);
let taskSequence = 0;
const transport = createTransport({
  onReady() { connected.value = true; },
  onError(message) { error.value = message; },
  applyContext(context) { locale.value = normalizeLocale(context?.locale); document.documentElement.lang = locale.value === 'zh' ? 'zh-CN' : 'en'; document.documentElement.dataset.theme = context?.theme ?? 'light'; },
});
onUnmounted(() => transport.close());
function finishTask(value) {
  result.value = value;
  completed.value = taskRun.value?.label ?? '';
}
function taskBusy(value) {
  busy.value = value;
  if (!value) {
    elapsed.value = Date.now() - (taskRun.value?.started ?? Date.now());
    activeAction.value = '';
  }
}
function formatJSON(field) {
  try { values[field.id] = JSON.stringify(JSON.parse(values[field.id] || '{}'), null, 2); error.value = ''; }
  catch { error.value = `${field.label}: ${copy.value.invalidJSON}`; }
}
const picking = ref(false);
const selectedAction = ref(props.config.actions[0]?.id);
const visibleFields = computed(() => props.policy.fields?.(props.config.fields, selectedAction.value) ?? props.config.fields);
const visibleActions = computed(() => props.policy.actions?.(props.config.actions, selectedAction.value) ?? props.config.actions);
const guidance = computed(() => props.policy.guidance || copy.value.guidance);
watch(values, () => { result.value = null; completed.value = ''; error.value = ''; }, { flush: 'sync' });
watch(selectedAction, () => { error.value = ''; });
async function selectPath(field) {
  if (picking.value || busy.value || !connected.value) return;
  error.value = '';
  if (field.id !== 'root' && !String(values.root || '').trim()) { error.value = copy.value.selectRoot; return; }
  picking.value = true;
  try {
    const selected = await transport.pickPath(pathFieldKind(field));
    if (selected) values[field.id] = field.id === 'root' ? selected : relativeProjectPath(values.root, selected);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : copy.value.pickFailed; }
  finally { picking.value = false; }
}
async function run(action) {
  if (!connected.value || busy.value || picking.value || taskUncertain.value) return;
  error.value = '';
  const start = Date.now();
  let startedTask = false;
  try {
    const payload = (props.policy.buildPayload ?? buildPayload)(props.config, values, action.id, locale.value);
    busy.value = true; activeAction.value = action.id; result.value = null; completed.value = '';
    if (longTask.value) {
      startedTask = true;
      taskRun.value = { key: ++taskSequence, action: action.id, label: action.label, payload, started: start };
      return;
    }
    taskRun.value = null;
    result.value = await transport.call(action.id, payload);
    completed.value = action.label;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : copy.value.failed; }
  finally {
      if (!startedTask) {
        elapsed.value = Date.now() - start; busy.value = false; activeAction.value = '';
      }
    }
}
</script>
<template>
  <ElConfigProvider :locale="locale === 'zh' ? zhLocale : enLocale"><main class="official-plugin-page">
    <header class="plugin-page-header"><div class="plugin-page-header__brand"><span class="plugin-page-header__logo" aria-hidden="true">{{ logoLetter }}</span><div class="plugin-page-header__text"><h1 class="plugin-page-header__title">{{ config.title }}</h1><p class="plugin-page-header__desc">{{ copy.subtitle }}</p></div></div><div class="plugin-page-header__aside"><ElTag :type="connected ? 'success' : 'warning'">{{ connected ? copy.connected : copy.waiting }}</ElTag></div></header>
    <ElCollapse class="plugin-notice"><ElCollapseItem :title="copy.requirements" name="notice"><ElAlert :title="config.notice" type="info" :closable="false" show-icon /></ElCollapseItem></ElCollapse>
    <ElAlert :title="guidance" type="info" :closable="false" show-icon />
    <div class="plugin-workbench">
      <ElScrollbar class="plugin-panel-scrollbar" always><aside class="plugin-parameters"><h2>{{ copy.parameters }}</h2><p class="plugin-section-caption">{{ copy.configure }}</p>
        <div v-if="policy.actionLabel" class="plugin-actions"><ElButton v-for="action in config.actions" :key="action.id" :type="selectedAction === action.id ? 'primary' : 'default'" :disabled="busy || picking" @click="selectedAction = action.id">{{ policy.actionLabel(action) }}</ElButton></div>
        <ElForm label-position="top" :disabled="busy || picking || taskUncertain" class="plugin-form" size="default" @submit.prevent>
          <div class="plugin-field-grid">
          <ElFormItem v-for="field in visibleFields" :key="field.id" class="plugin-field-wide" :label="field.type === 'boolean' ? undefined : field.label" :required="field.id === 'root'">
            <ElCheckbox v-if="field.type === 'boolean'" v-model="values[field.id]">{{ field.label }}</ElCheckbox>
            <template v-else><ElInput v-model="values[field.id]" :type="field.type === 'json' ? 'textarea' : 'text'" :rows="field.rows || 3" :maxlength="field.type === 'json' ? 32000 : 4096" :placeholder="field.placeholder || (field.id === 'root' ? '/Users/you/projects/example' : field.label)" autocomplete="off" :spellcheck="false"><template v-if="pathFieldKind(field) && field.id !== 'root'" #append><ElButton :disabled="!connected || picking" @click="selectPath(field)">{{ pathFieldKind(field) === 'directory' ? copy.directory : copy.file }}</ElButton></template></ElInput><ElButton v-if="field.id === 'root'" class="plugin-directory-picker" type="primary" plain :disabled="!connected || busy || picking" :loading="picking" @click="selectPath(field)">{{ copy.directory }}</ElButton><ElButton v-if="field.type === 'json'" text size="small" @click="formatJSON(field)">{{ copy.formatJSON }}</ElButton></template>
          </ElFormItem>
          </div>
          <ElFormItem><ElCheckbox v-model="longTask">{{ taskCopy['plugins.taskMode'] }}</ElCheckbox></ElFormItem>
          <div class="plugin-actions"><ElButton v-for="(action, index) in visibleActions" :key="action.id" :type="action.risk === 'dangerous' ? 'danger' : index === 0 ? 'primary' : 'default'" :disabled="!connected || busy || taskUncertain" :loading="busy && activeAction === action.id" @click="run(action)">{{ action.label }}</ElButton></div>
        </ElForm>
        <p class="plugin-result-hint">{{ copy.safety }}</p>
      </aside></ElScrollbar>
      <ElScrollbar class="plugin-panel-scrollbar" always><section class="plugin-result" aria-live="polite" :aria-busy="busy"><div class="plugin-heading"><h2>{{ copy.results }}</h2><span v-if="completed">{{ completed }} · {{ (elapsed / 1000).toFixed(1) }} {{ copy.seconds }}</span><ElButton v-if="result" size="small" :disabled="busy" @click="result = null; completed = ''">{{ copy.clear }}</ElButton></div>
        <PluginTaskPanel v-if="taskRun" :key="taskRun.key" :tasks="transport.tasks" :action="taskRun.action" :payload="taskRun.payload" :locale="locale" auto-start @result="finishTask" @busy="taskBusy" @uncertain="taskUncertain = $event" />
        <ElAlert v-if="error" :title="error" :type="/取消|cancel/i.test(error) ? 'info' : 'error'" :closable="false" show-icon role="alert" />
        <ElEmpty v-if="busy" :description="copy.running" :image-size="64" />
        <slot v-else-if="completed" name="result" :data="result" :values="values" />
        <ElEmpty v-else :description="error ? copy.incomplete : copy.empty" :image-size="72"><p class="plugin-empty-hint">{{ connected ? copy.readyHint : copy.waitingHint }}</p></ElEmpty>
      </section></ElScrollbar>
    </div>
  </main></ElConfigProvider>
</template>

<style scoped>
.plugin-directory-picker { margin-top: 8px; margin-left: 0; }
</style>
