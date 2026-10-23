<script setup lang="ts">
import { ref } from 'vue';
import { ElButton, ElOption, ElSelect, ElTag } from 'element-plus';
import { Connection, Files, Plus, Setting, SwitchButton } from '@element-plus/icons-vue';

/** A saved connection profile; plugins may carry extra fields for the detail/label callbacks. */
export interface PluginConnectionProfile { id: string; name: string }

/** Plugin-owned copy. `connect` is the final primary label, e.g. "Reconnect" while connected. */
export interface PluginConnectionLabels {
  waiting: string; connected: string; disconnected: string;
  unsaved: string; profile: string; manageProfiles: string; modified?: string;
  newConnection: string; settings: string; connect: string; disconnect?: string;
}

type Profile = PluginConnectionProfile & Record<string, unknown>;

const props = withDefaults(defineProps<{
  labels: PluginConnectionLabels;
  ready: boolean;
  connected: boolean;
  statusLabel?: string;
  statusTitle?: string;
  modelValue: string;
  unsavedValue?: string;
  profiles: readonly Profile[];
  profileLabel?: (profile: Profile) => string;
  profileDetail?: (profile: Profile) => string;
  profileLive?: (profile: Profile) => boolean;
  unsavedLive?: boolean;
  selectPlaceholder?: string;
  selectDisabled?: boolean;
  selectLoading?: boolean;
  filterable?: boolean;
  modified?: boolean;
  newDisabled?: boolean;
  settingsDisabled?: boolean;
  settingsTitle?: string;
  connectDisabled?: boolean;
  connectLoading?: boolean;
  /** Show Disconnect instead of the primary action while connected. */
  disconnectable?: boolean;
  disconnectDisabled?: boolean;
  disconnectLoading?: boolean;
}>(), { unsavedValue: '', statusLabel: '', statusTitle: '', settingsTitle: '' });

const emit = defineEmits<{
  'update:modelValue': [id: string];
  open: [];
  manage: [];
  new: [];
  settings: [];
  connect: [];
  disconnect: [];
}>();

const select = ref<{ blur(): void } | null>(null);
// Close the dropdown before the plugin opens its profile manager over it.
function manage() { select.value?.blur(); emit('manage'); }
function visibleChange(open: boolean) { if (open) emit('open'); }
const showDisconnect = () => props.disconnectable && props.connected;
</script>

<template>
  <div class="plugin-page-header__aside plugin-connection-bar">
    <ElTag v-if="!ready" disable-transitions type="warning">{{ labels.waiting }}</ElTag>
    <ElTag v-else disable-transitions :type="connected ? 'success' : 'info'" :title="connected ? statusTitle || undefined : undefined">{{ connected ? statusLabel || labels.connected : labels.disconnected }}</ElTag>
    <slot name="status" />
    <ElSelect
      ref="select"
      class="plugin-connection-bar__select"
      popper-class="plugin-select-popper plugin-connection-bar__popper"
      :model-value="modelValue"
      :empty-values="[null, undefined]"
      :disabled="!ready || selectDisabled"
      :loading="selectLoading"
      :filterable="filterable"
      :placeholder="selectPlaceholder || labels.unsaved"
      :aria-label="labels.profile"
      @update:model-value="emit('update:modelValue', $event)"
      @visible-change="visibleChange"
    >
      <ElOption :value="unsavedValue" :label="labels.unsaved">
        <span class="plugin-connection-bar__option">
          <span v-if="profileLive" class="plugin-connection-bar__dot" :class="{ 'is-live': unsavedLive }" />
          <span class="plugin-connection-bar__name">{{ labels.unsaved }}</span>
        </span>
      </ElOption>
      <ElOption v-for="profile in profiles" :key="profile.id" :value="profile.id" :label="profileLabel ? profileLabel(profile) : profile.name">
        <span class="plugin-connection-bar__option">
          <span v-if="profileLive" class="plugin-connection-bar__dot" :class="{ 'is-live': profileLive(profile) }" :aria-label="profileLive(profile) ? labels.connected : undefined" />
          <span class="plugin-connection-bar__name">{{ profile.name }}</span>
          <small v-if="profileDetail" class="plugin-connection-bar__detail">{{ profileDetail(profile) }}</small>
        </span>
      </ElOption>
      <template #footer>
        <ElButton text size="small" class="plugin-connection-bar__manage" :icon="Files" :disabled="!ready" @click="manage">{{ labels.manageProfiles }}</ElButton>
      </template>
    </ElSelect>
    <ElTag v-if="modified" disable-transitions type="warning">{{ labels.modified }}</ElTag>
    <ElButton :icon="Plus" :disabled="!ready || newDisabled" @click="emit('new')">{{ labels.newConnection }}</ElButton>
    <ElButton :icon="Setting" :disabled="settingsDisabled" :title="settingsTitle || undefined" @click="emit('settings')">{{ labels.settings }}<slot name="settings" /></ElButton>
    <slot name="actions" />
    <ElButton v-if="showDisconnect()" :icon="SwitchButton" :disabled="disconnectDisabled" :loading="disconnectLoading" @click="emit('disconnect')">{{ labels.disconnect }}</ElButton>
    <ElButton v-else type="primary" :icon="Connection" :disabled="!ready || connectDisabled" :loading="connectLoading" @click="emit('connect')">{{ labels.connect }}</ElButton>
  </div>
</template>

<style scoped>
.plugin-connection-bar { flex: 0 0 auto; max-width: 100%; }
/* Plugins may set all selects to width:100%; the toolbar picker must retain its own basis. */
.plugin-connection-bar .plugin-connection-bar__select { flex: 0 0 auto; width: 220px; min-width: 120px; }
.plugin-connection-bar :deep(.el-select--default .el-select__wrapper) { min-height: 28px; padding: 4px 12px; }
.plugin-connection-bar > :deep(.el-button) { flex: none; width: auto; margin-left: 0; }
@media (max-width: 720px) {
  .plugin-connection-bar { flex: 1 1 100%; }
  .plugin-connection-bar .plugin-connection-bar__select { flex: 1 1 160px; width: auto; }
}
</style>
