<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElAlert, ElButton } from 'element-plus';
import { taskMessagesEn, taskMessagesZh } from './task-messages';
import type { TaskSnapshot as PluginUITaskSnapshot } from './transport.js';

const props = defineProps<{
  tasks: {
    start: (action: string, payload: unknown, timeoutMs?: number) => Promise<PluginUITaskSnapshot>;
    get: (taskId: string) => Promise<PluginUITaskSnapshot>;
    cancel: (taskId: string) => Promise<PluginUITaskSnapshot>;
    /** features.taskEvents: pushed snapshots end the wait at once; polling stays as a fallback. */
    pushSupported?: () => boolean;
    onChanged?: (listener: (snapshot: PluginUITaskSnapshot) => void) => () => void;
  };
  action: string;
  payload?: unknown;
  locale: string;
  disabled?: boolean;
  autoStart?: boolean;
}>();
const emit = defineEmits<{ result: [value: unknown]; busy: [value: boolean]; uncertain: [value: boolean] }>();
const copy = computed(() => props.locale === 'zh' ? taskMessagesZh : taskMessagesEn);
const snapshot = ref<PluginUITaskSnapshot>();
const busy = ref(false), cancelling = ref(false), error = ref('');
const uncertain = ref(false), checking = ref(false);
let delivered = false;
function running() { return snapshot.value?.state === 'running'; }
function definitive() {
  return snapshot.value && snapshot.value.state !== 'running' && !snapshot.value.outcomeUnconfirmed;
}
function accept(value: PluginUITaskSnapshot) {
  if (disposed || (snapshot.value && snapshot.value.taskId !== value.taskId) || definitive()) return;
  if (snapshot.value?.state !== undefined && snapshot.value.state !== 'running' && value.state === 'running') return;
  snapshot.value = { ...value, cancelRequested: value.cancelRequested || snapshot.value?.cancelRequested === true };
  if (value.outcomeUnconfirmed) { markUncertain(copy.value['plugins.taskPollingStopped']); return; }
  if (value.state === 'running') return;
  uncertain.value = false; emit('uncertain', false); error.value = '';
  if (value.state === 'succeeded' && !delivered) { delivered = true; emit('result', value.result); }
  else if (value.state === 'failed') error.value = value.error || copy.value['plugins.taskFailed'];
  clearTimeout(timer); wake?.();
}
async function recheck() {
  if (!snapshot.value || checking.value || disposed) return;
  checking.value = true;
  try { accept(await props.tasks.get(snapshot.value.taskId)); }
  catch (cause) {
    if (!disposed && !definitive()) markUncertain(`${copy.value['plugins.taskPollingStopped']} ${cause instanceof Error ? cause.message : ''}`);
  } finally { if (!disposed) checking.value = false; }
}
let disposed = false;
function markUncertain(message: string) {
  uncertain.value = true;
  error.value = message;
  emit('uncertain', true);
}
function cancelDetached(task: PluginUITaskSnapshot) {
  if (task.state === 'running') void props.tasks.cancel(task.taskId).catch(() => undefined);
}
let timer: ReturnType<typeof setTimeout> | undefined;
let wake: (() => void) | undefined;
let stopPush: (() => void) | undefined;
function pause(ms: number) {
  return new Promise<void>((resolve) => { wake = resolve; timer = setTimeout(resolve, ms); });
}
async function start() {
  if (uncertain.value || busy.value || cancelling.value || checking.value || running() || props.disabled || disposed) return;
  busy.value = true; emit('busy', true); error.value = ''; snapshot.value = undefined; delivered = false;
  const deadline = Date.now() + 310_000;
  try {
    let value = await props.tasks.start(props.action, props.payload, 300_000);
    if (disposed) { cancelDetached(value); return; }
    const taskId = value.taskId;
    const pushes = props.tasks.pushSupported?.() === true && typeof props.tasks.onChanged === 'function';
    // accept() wakes the loop for a terminal snapshot; running pushes only update progress.
    if (pushes) stopPush = props.tasks.onChanged?.((next) => { if (next.taskId === taskId) accept(next); });
    while (!disposed) {
      accept(value);
      if (uncertain.value || !running()) break;
      if (Date.now() >= deadline) { markUncertain(copy.value['plugins.taskPollingStopped']); break; }
      await pause(pushes ? 2000 : 1000);
      if (disposed || definitive() || uncertain.value) break;
      value = await props.tasks.get(value.taskId);
    }
  } catch (cause) {
    if (!disposed && !definitive()) {
      const detail = cause instanceof Error ? cause.message : copy.value['plugins.taskFailed'];
      if (snapshot.value || (cause instanceof Error && 'uncertain' in cause && cause.uncertain === true)) {
        markUncertain(`${copy.value['plugins.taskPollingStopped']} ${detail}`);
      } else error.value = detail;
    }
  } finally {
    stopPush?.(); stopPush = undefined;
    if (!disposed) { busy.value = false; emit('busy', false); }
  }
}
async function cancel() {
  if (!snapshot.value || snapshot.value.state !== 'running' || cancelling.value || disposed) return;
  cancelling.value = true;
  try {
    const value = await props.tasks.cancel(snapshot.value.taskId);
    accept(value);
  } catch (cause) {
    if (!disposed && !definitive()) markUncertain(`${copy.value['plugins.taskCancelUncertain']} ${cause instanceof Error ? cause.message : ''}`);
  } finally { if (!disposed) cancelling.value = false; }
}
onMounted(() => { if (props.autoStart) void start(); });
onBeforeUnmount(() => {
  disposed = true; clearTimeout(timer); wake?.(); stopPush?.(); stopPush = undefined;
  if (snapshot.value) cancelDetached(snapshot.value);
});
</script>

<template>
  <section class="app-plugin-task" aria-live="polite" :aria-busy="busy">
    <ElAlert :title="copy['plugins.taskHelp']" type="info" :closable="false" />
    <ElButton v-if="!autoStart" :disabled="uncertain || disabled || busy || snapshot?.state === 'running'" :loading="busy && !snapshot" @click="start">{{ copy['plugins.taskStart'] }}</ElButton>
    <ElButton v-if="snapshot?.state === 'running'" :disabled="cancelling || snapshot.cancelRequested" :loading="cancelling" @click="cancel">{{ copy['plugins.taskCancel'] }}</ElButton>
    <ElButton v-if="uncertain && snapshot" :loading="checking" :disabled="checking" @click="recheck">{{ copy['plugins.taskRecheck'] }}</ElButton>
    <p v-if="uncertain">{{ copy['plugins.taskUnknown'] }}</p>
    <p v-else-if="snapshot">{{ copy[`plugins.task.${snapshot.state}`] }}</p>
    <p v-if="snapshot?.cancelRequested">{{ copy['plugins.taskCancelRequested'] }}</p>
    <pre v-if="snapshot?.progress !== undefined">{{ JSON.stringify(snapshot.progress, null, 2) }}</pre>
    <ElAlert v-if="error" :title="error" :type="uncertain ? 'warning' : 'error'" :closable="false" />
    <slot v-if="!uncertain && snapshot?.state === 'succeeded'" name="result" :result="snapshot.result" />
  </section>
</template>

<style scoped>
.app-plugin-task { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.app-plugin-task pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
