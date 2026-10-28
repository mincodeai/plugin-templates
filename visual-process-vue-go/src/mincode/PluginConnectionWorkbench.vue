<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElButton, ElDialog, ElDrawer, ElDropdown, ElDropdownItem, ElDropdownMenu, ElIcon, ElInput, ElPopover, ElScrollbar, ElTag, ElTree } from 'element-plus';
import { Connection, Expand, Fold, InfoFilled, Lock, MoreFilled, Plus, Search, SwitchButton, Unlock } from '@element-plus/icons-vue';
import { environmentTagType, groupConnections as groupConnectionsJs, groupNames } from './connection-groups.mjs';
import { messages, normalizeLocale } from './messages.mjs';
import PluginConnectionMetaFields from './PluginConnectionMetaFields.vue';

/** A saved connection profile; plugins may carry extra fields for the `detail` callback. */
export interface PluginWorkbenchProfile { id: string; name: string }
/** Viewer preferences kept in the plugin's `profileMeta` document (see `setConnectionPrefs`). */
export interface PluginWorkbenchPrefs { collapsed: string[]; width: number; recent: string[] }
type Profile = PluginWorkbenchProfile & Record<string, unknown>;
type Meta = Record<string, { group?: string; environment?: string }>;
type Item = { profile: Profile; group: string; environment: string };
// connection-groups.mjs is untyped JavaScript; this is its documented signature.
const groupConnections = groupConnectionsJs as unknown as (profiles: readonly Profile[], meta: Meta,
  options?: { query?: string; locale?: string; detail?: (profile: Profile) => string }) => { name: string; items: Item[] }[];

const props = withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  /** Short mark (letter or emoji) shown before the title at the top of the list. */
  logo?: string;
  listTitle: string;
  profiles: readonly Profile[];
  meta: Meta;
  prefs: PluginWorkbenchPrefs;
  /** '' = the temporary (unsaved) connection. */
  activeId: string;
  showTemporary?: boolean;
  connected: boolean;
  ready: boolean;
  /** false = selecting a profile is enough; no connect/disconnect controls or not-connected card. */
  connectable: boolean;
  detail?: (profile: Profile) => string;
  statusTitle?: string;
  /** A connect/disconnect is in flight: the primary button spins and is disabled. */
  busy?: boolean;
  /** null = the plugin has no read-only mode, so no lock is shown. */
  readOnly?: boolean | null;
  locale: string;
  securityText?: string;
  // Optional carry-overs from PluginConnectionBar so every plugin keeps its current top-bar behaviour.
  /** Status text for the live dot (default: shell "Connected"). */
  statusLabel?: string;
  /** Primary label override, e.g. "Reconnect" while connected for plugins without Disconnect. */
  connectLabel?: string;
  disconnectLabel?: string;
  temporaryLabel?: string;
  /** false = keep showing the connect (reconnect) button while connected. */
  disconnectable?: boolean;
  connectDisabled?: boolean;
  disconnectDisabled?: boolean;
  /** Blocks choosing another row, e.g. while a single-session plugin is connected. */
  selectDisabled?: boolean;
  newDisabled?: boolean;
}>(), {
  subtitle: '', logo: '', showTemporary: false, detail: undefined, statusTitle: '', busy: false, readOnly: null, securityText: '',
  statusLabel: '', connectLabel: '', disconnectLabel: '', temporaryLabel: '', disconnectable: true,
  connectDisabled: false, disconnectDisabled: false, selectDisabled: false, newDisabled: false,
});

const emit = defineEmits<{
  select: [id: string];
  connect: [];
  disconnect: [];
  new: [];
  edit: [id: string];
  duplicate: [id: string];
  delete: [id: string];
  'set-meta': [value: { id: string; group: string; environment: string }];
  'rename-group': [value: { from: string; to: string }];
  'toggle-read-only': [value: boolean];
  'set-prefs': [prefs: Partial<PluginWorkbenchPrefs>];
}>();

const MIN_WIDTH = 180, MAX_WIDTH = 360, DEFAULT_WIDTH = 240, MAX_RECENT = 5, MAX_GROUP_RUNES = 40;
const clampWidth = (value: unknown) => {
  const width = Number(value);
  return Number.isFinite(width) && width > 0 ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width))) : DEFAULT_WIDTH;
};
const copy = computed(() => messages[normalizeLocale(props.locale)]);
const lang = computed(() => normalizeLocale(props.locale));
const envName = (env: string) => (copy.value as Record<string, string>)[`env_${env}`] ?? env;
const describe = (profile: Profile) => (props.detail ? String(props.detail(profile) ?? '') : '');

// Preferences changed here apply at once; the plugin's next `prefs` replaces this optimistic overlay.
// Nothing is stored by the shell itself: the sandboxed iframe has no web storage.
const pending = reactive<Partial<PluginWorkbenchPrefs>>({});
watch(() => props.prefs, () => { for (const key of Object.keys(pending) as (keyof PluginWorkbenchPrefs)[]) delete pending[key]; });
const collapsed = computed(() => new Set(Array.isArray(pending.collapsed ?? props.prefs?.collapsed) ? (pending.collapsed ?? props.prefs.collapsed) : []));
const recentIds = computed(() => (Array.isArray(pending.recent ?? props.prefs?.recent) ? (pending.recent ?? props.prefs.recent) : []));
function setPrefs(partial: Partial<PluginWorkbenchPrefs>) {
  Object.assign(pending, partial);
  emit('set-prefs', partial);
}

const query = ref('');
const groups = computed(() => groupConnections(props.profiles, props.meta, { query: query.value, locale: lang.value, detail: describe }));
const knownGroups = computed(() => groupNames(props.meta, lang.value) as string[]);
const searching = computed(() => query.value.trim() !== '');
function setGroupOpen(name: string, open: boolean) {
  const next = new Set(collapsed.value);
  if (open === !next.has(name)) return;
  if (open) next.delete(name); else next.add(name);
  setPrefs({ collapsed: [...next] });
}

// Every saved connection with its cleaned group/environment, unaffected by the search box.
const entries = computed(() => new Map(groupConnections(props.profiles, props.meta).flatMap(group => group.items).map(item => [item.profile.id, item])));
const entryOf = (id: string) => entries.value.get(id);
const active = computed(() => (props.activeId ? entryOf(props.activeId) : undefined));
const activeName = computed(() => (props.activeId ? active.value?.profile.name ?? '' : props.showTemporary ? props.temporaryLabel || copy.value.connTemporary : ''));
const activeDetail = computed(() => (active.value ? describe(active.value.profile) : ''));
const isLive = (id: string) => props.connected && props.activeId === id;
const recent = computed(() => recentIds.value.map(entryOf).filter((item): item is Item => !!item).slice(0, MAX_RECENT));

// The list is one ElTree: the temporary connection is a root leaf, groups are parents ('' = ungrouped,
// last) and connections are leaves. Keys are prefixed so a group name can never collide with an id.
type TreeNode =
  | { key: string; kind: 'temporary' }
  | { key: string; kind: 'group'; name: string; children: TreeNode[] }
  | { key: string; kind: 'item'; item: Item };
const groupKey = (name: string) => `g:${name}`, itemKey = (id: string) => `c:${id}`, TEMPORARY_KEY = 't:';
// ElTree types node data loosely (TreeNodeData); every node here is a TreeNode.
const asNode = (data: unknown) => data as TreeNode;
const treeProps = { label: 'key', children: 'children', class: (data: unknown) => {
  const { kind } = asNode(data);
  return { [`is-${kind}`]: true, 'is-locked': kind !== 'group' && (props.selectDisabled || !props.ready) };
} };
const allGroups = computed(() => groupConnections(props.profiles, props.meta, { locale: lang.value }));
const treeData = computed<TreeNode[]>(() => [
  ...(props.showTemporary ? [{ key: TEMPORARY_KEY, kind: 'temporary' as const }] : []),
  ...allGroups.value.map(group => ({ key: groupKey(group.name), kind: 'group' as const, name: group.name,
    children: group.items.map(item => ({ key: itemKey(item.profile.id), kind: 'item' as const, item })) })),
]);
const expandedKeys = computed(() => allGroups.value.filter(group => !collapsed.value.has(group.name)).map(group => groupKey(group.name)));
const currentKey = computed(() => (props.activeId ? (entryOf(props.activeId) ? itemKey(props.activeId) : null) : props.showTemporary ? TEMPORARY_KEY : null));
// Group counts follow the search, like the list itself.
const groupCounts = computed(() => new Map(groups.value.map(group => [group.name, group.items.length])));
const visibleIds = computed(() => new Set(groups.value.flatMap(group => group.items.map(item => item.profile.id))));
const treeRef = ref<InstanceType<typeof ElTree>>();

// Search uses groupConnections' matching (name, detail, group name, environment names in both languages;
// a matching group keeps all its children). Groups show whenever a child does.
function filterNode(value: string, raw: unknown) {
  const data = asNode(raw);
  if (!String(value ?? '').trim()) return true;
  return data.kind === 'item' && visibleIds.value.has(data.item.profile.id);
}
function onNodeClick(raw: unknown) {
  const data = asNode(raw);
  if (data.kind !== 'group') choose(data.kind === 'item' ? data.item.profile.id : '');
  // Groups only toggle (ElTree's expand-on-click); the highlight always follows activeId, never the click.
  nextTick(syncTree);
}
function onNodeExpand(raw: unknown) { const data = asNode(raw); if (data.kind === 'group') setGroupOpen(data.name, true); }
function onNodeCollapse(raw: unknown) { const data = asNode(raw); if (data.kind === 'group') setGroupOpen(data.name, false); }
// ElTree moves focus with ↑/↓ and toggles with ←/→; Enter and Space activate the focused node like a click.
function onTreeKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (!target?.classList?.contains('el-tree-node') || !['Enter', 'NumpadEnter', ' '].includes(event.key)) return;
  event.preventDefault();
  target.click();
}

// Programmatic expand/collapse and highlight emit no ElTree events, so syncing never writes prefs.
// ElTree expands the active connection's group on its own (setCurrentNodeKey); this restores prefs.collapsed.
function syncTree() {
  const tree = treeRef.value;
  if (!tree) return;
  if (!searching.value) {
    for (const group of allGroups.value) {
      const node = tree.getNode(groupKey(group.name));
      const open = !collapsed.value.has(group.name);
      if (node && node.expanded !== open) { if (open) node.expand(); else node.collapse(); }
    }
  }
  tree.setCurrentKey(currentKey.value ?? undefined, false);
}
watch([treeRef, treeData, query], () => { treeRef.value?.filter(query.value); syncTree(); }, { flush: 'post' });
watch([collapsed, currentKey], syncTree, { flush: 'post' });

// One context menu for the whole list, opened at the pointer (ElDropdown virtual triggering).
type MenuTarget = { kind: 'item'; item: Item } | { kind: 'group'; name: string };
const menuRef = ref<InstanceType<typeof ElDropdown>>();
const menuTarget = ref<MenuTarget | null>(null);
const pointRect = (x: number, y: number) => ({ x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0, toJSON: () => ({ x, y }) });
const menuRect = ref(pointRect(0, 0));
const menuAnchor = ref({ getBoundingClientRect: () => menuRect.value });
let menuVisible = false;
const onMenuVisible = (open: boolean) => { menuVisible = open; };
function onNodeContextmenu(evt: Event, raw: unknown) {
  const event = evt as MouseEvent, data = asNode(raw);
  if (data.kind === 'temporary' || (data.kind === 'group' && !data.name)) { menuRef.value?.handleClose(); return; }
  // Keyboard context-menu keys report (0, 0): anchor to the node instead.
  const keyboard = event.clientX === 0 && event.clientY === 0;
  const box = keyboard ? (event.target as HTMLElement | null)?.getBoundingClientRect?.() : undefined;
  menuRect.value = box ? pointRect(box.left + 12, box.bottom) : pointRect(event.clientX, event.clientY);
  menuTarget.value = data.kind === 'item' ? { kind: 'item', item: data.item } : { kind: 'group', name: data.name };
  // Opening cancels the close an outside pointerdown just queued; an open menu then moves to the new point.
  menuRef.value?.handleOpen();
  if (menuVisible) nextTick(() => (menuRef.value as { popperRef?: { updatePopper?: () => void } } | undefined)?.popperRef?.updatePopper?.());
}
function menuCommand(command: RowCommand | 'rename' | 'delete-group') {
  const target = menuTarget.value;
  if (!target) return;
  if (target.kind === 'group') { if (command === 'rename' || command === 'delete-group') groupCommand(command === 'rename' ? 'rename' : 'delete', target.name); }
  else if (command !== 'rename' && command !== 'delete-group') rowCommand(command, target.item);
}

const narrow = ref(false), drawerOpen = ref(false), sidebarHidden = ref(false);
function choose(id: string) {
  if (props.selectDisabled || !props.ready) return;
  emit('select', id);
  drawerOpen.value = false;
  if (!id || recentIds.value[0] === id) return;
  setPrefs({ recent: [id, ...recentIds.value.filter(other => other !== id)].slice(0, MAX_RECENT) });
}

type RowCommand = 'connect' | 'disconnect' | 'edit' | 'duplicate' | 'move' | 'delete';
function rowCommand(command: RowCommand, item: Item) {
  const id = item.profile.id;
  if (command === 'connect') { if (id === props.activeId) emit('connect'); else choose(id); }
  else if (command === 'disconnect') emit('disconnect');
  else if (command === 'edit') emit('edit', id);
  else if (command === 'duplicate') emit('duplicate', id);
  else if (command === 'delete') emit('delete', id);
  else if (command === 'move') openMove(item);
}

const moveOpen = ref(false), moveId = ref(''), moveValue = ref({ group: '', environment: '' });
function openMove(item: Item) {
  moveId.value = item.profile.id;
  moveValue.value = { group: item.group, environment: item.environment };
  moveOpen.value = true;
}
function applyMove() {
  emit('set-meta', { id: moveId.value, group: moveValue.value.group, environment: moveValue.value.environment });
  moveOpen.value = false;
}

const renameOpen = ref(false), renameFrom = ref(''), renameValue = ref('');
const renameTarget = computed(() => renameValue.value.trim());
const renameValid = computed(() => {
  const name = renameTarget.value;
  return !!name && name !== renameFrom.value && [...name].length <= MAX_GROUP_RUNES && !/[\p{Cc}\u2028\u2029]/u.test(name);
});
function groupCommand(command: 'rename' | 'delete', name: string) {
  if (command === 'delete') { emit('rename-group', { from: name, to: '' }); return; }
  renameFrom.value = name;
  renameValue.value = name;
  renameOpen.value = true;
}
function applyRename() {
  if (!renameValid.value) return;
  emit('rename-group', { from: renameFrom.value, to: renameTarget.value });
  renameOpen.value = false;
}

// Sidebar width: drag the separator (pointer) or use the arrow keys; the result goes to the plugin once.
const dragWidth = ref<number | null>(null);
const sidebarWidth = computed(() => dragWidth.value ?? clampWidth(pending.width ?? props.prefs?.width));
let dragStart = { x: 0, width: DEFAULT_WIDTH };
function startResize(event: PointerEvent) {
  if (event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  dragStart = { x: event.clientX, width: sidebarWidth.value };
  dragWidth.value = sidebarWidth.value;
}
function moveResize(event: PointerEvent) {
  if (dragWidth.value === null) return;
  dragWidth.value = clampWidth(dragStart.width + event.clientX - dragStart.x);
}
function endResize() {
  if (dragWidth.value === null) return;
  const width = dragWidth.value;
  dragWidth.value = null;
  if (width !== clampWidth(props.prefs?.width) || pending.width !== undefined) setPrefs({ width });
}
function keyResize(delta: number) {
  const width = clampWidth(sidebarWidth.value + delta);
  if (width !== sidebarWidth.value) setPrefs({ width });
}

// Below 720px the list becomes a drawer opened from the top bar.
const sideHost = computed(() => (narrow.value
  ? { is: ElDrawer, attrs: { modelValue: drawerOpen.value, 'onUpdate:modelValue': (open: boolean) => { drawerOpen.value = open; }, direction: 'ltr', size: 'min(85vw, 300px)', withHeader: false, class: 'plugin-connection-workbench__drawer' } }
  : { is: 'div', attrs: { class: 'plugin-connection-workbench__side', style: { width: `${sidebarWidth.value}px` } } }));
const toggleLabel = computed(() => (narrow.value || sidebarHidden.value ? copy.value.connExpand : copy.value.connCollapse));
function toggleSidebar() {
  if (narrow.value) drawerOpen.value = true;
  else sidebarHidden.value = !sidebarHidden.value;
}
let media: MediaQueryList | undefined;
const syncNarrow = () => { narrow.value = !!media?.matches; if (!narrow.value) drawerOpen.value = false; };
onMounted(() => {
  media = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 720px)') : undefined;
  syncNarrow();
  media?.addEventListener?.('change', syncNarrow);
});
onBeforeUnmount(() => media?.removeEventListener?.('change', syncNarrow));

const emptyTitle = computed(() => copy.value.connEmptyTitle.replace('{name}', props.title));
const hasSaved = computed(() => props.profiles.length > 0);
const showDisconnect = computed(() => props.disconnectable && props.connected);
</script>

<template>
  <div class="plugin-connection-workbench" :style="{ '--plugin-connection-sidebar-width': `${sidebarWidth}px` }">
    <component :is="sideHost.is" v-if="narrow || !sidebarHidden" v-bind="sideHost.attrs">
      <aside class="plugin-connection-workbench__sidebar" :aria-label="listTitle">
        <div class="plugin-connection-workbench__brand" :title="subtitle || undefined">
          <span v-if="logo" class="plugin-connection-workbench__logo" aria-hidden="true">{{ logo }}</span>
          <h1 class="plugin-connection-workbench__title">{{ title }}</h1>
        </div>
        <div class="plugin-connection-workbench__list-head">
          <span class="plugin-connection-workbench__list-title">{{ listTitle }}</span>
          <ElButton text circle size="small" :icon="Plus" :title="copy.connNew" :aria-label="copy.connNew" :disabled="!ready || newDisabled" @click="emit('new')" />
        </div>
        <ElInput v-model="query" class="plugin-connection-workbench__search" size="small" clearable :prefix-icon="Search" :placeholder="copy.connSearch" :aria-label="copy.connSearch" />
        <ElScrollbar class="plugin-connection-workbench__list">
          <ElTree
            ref="treeRef"
            class="plugin-connection-workbench__tree"
            node-key="key"
            :data="treeData"
            :props="treeProps"
            :indent="12"
            highlight-current
            :current-node-key="currentKey ?? undefined"
            :default-expanded-keys="expandedKeys"
            :filter-node-method="filterNode"
            :empty-text="searching ? copy.connNoMatch : copy.connNone"
            :aria-label="listTitle"
            @node-click="onNodeClick"
            @node-expand="onNodeExpand"
            @node-collapse="onNodeCollapse"
            @node-contextmenu="onNodeContextmenu"
            @keydown="onTreeKeydown"
          >
            <template #default="{ data }">
              <span v-if="data.kind === 'group'" class="plugin-connection-workbench__group">
                <span class="plugin-connection-workbench__group-name">{{ data.name || copy.connUngrouped }}</span>
                <span class="plugin-connection-workbench__count">{{ groupCounts.get(data.name) ?? data.children.length }}</span>
              </span>
              <span v-else-if="data.kind === 'temporary'" class="plugin-connection-workbench__node">
                <span class="plugin-connection-workbench__dot" :class="{ 'is-live': isLive('') }" />
                <span class="plugin-connection-workbench__name">{{ temporaryLabel || copy.connTemporary }}</span>
              </span>
              <span v-else class="plugin-connection-workbench__node" :title="describe(data.item.profile) || undefined">
                <span class="plugin-connection-workbench__dot" :class="{ 'is-live': isLive(data.item.profile.id) }" :aria-label="isLive(data.item.profile.id) ? statusLabel || copy.connConnected : undefined" />
                <span class="plugin-connection-workbench__node-text">
                  <span class="plugin-connection-workbench__node-line">
                    <span class="plugin-connection-workbench__name">{{ data.item.profile.name }}</span>
                    <ElTag v-if="data.item.environment" size="small" disable-transitions :type="environmentTagType(data.item.environment)">{{ envName(data.item.environment) }}</ElTag>
                  </span>
                  <small v-if="describe(data.item.profile)" class="plugin-connection-workbench__detail">{{ describe(data.item.profile) }}</small>
                </span>
              </span>
            </template>
          </ElTree>
        </ElScrollbar>
        <ElDropdown
          ref="menuRef"
          trigger="contextmenu"
          virtual-triggering
          :virtual-ref="menuAnchor"
          :show-arrow="false"
          placement="bottom-start"
          @visible-change="onMenuVisible"
          @command="menuCommand"
        >
          <template #dropdown>
            <ElDropdownMenu v-if="menuTarget?.kind === 'group'">
              <ElDropdownItem command="rename">{{ copy.groupRename }}</ElDropdownItem>
              <ElDropdownItem command="delete-group">{{ copy.groupDelete }}</ElDropdownItem>
            </ElDropdownMenu>
            <ElDropdownMenu v-else-if="menuTarget?.kind === 'item'">
              <template v-if="connectable">
                <ElDropdownItem v-if="isLive(menuTarget.item.profile.id) && disconnectable" command="disconnect" :disabled="busy || disconnectDisabled">{{ disconnectLabel || copy.connDisconnect }}</ElDropdownItem>
                <ElDropdownItem v-else command="connect" :disabled="busy || !ready || (menuTarget.item.profile.id === activeId ? connectDisabled : selectDisabled)">{{ copy.connConnect }}</ElDropdownItem>
              </template>
              <ElDropdownItem command="edit" :divided="connectable">{{ copy.connEdit }}</ElDropdownItem>
              <ElDropdownItem command="duplicate">{{ copy.connDuplicate }}</ElDropdownItem>
              <ElDropdownItem command="move">{{ copy.connMoveTo }}</ElDropdownItem>
              <ElDropdownItem command="delete" divided class="plugin-connection-workbench__danger">{{ copy.connDelete }}</ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        <div class="plugin-connection-workbench__footer">
          <ElPopover v-if="securityText" trigger="click" placement="top-start" :width="320" popper-class="plugin-connection-workbench__security">
            <template #reference>
              <ElButton text size="small" :icon="InfoFilled">{{ copy.connSecurity }}</ElButton>
            </template>
            <div class="plugin-connection-workbench__security-text">{{ securityText }}</div>
          </ElPopover>
          <slot name="sidebar-footer" />
        </div>
      </aside>
      <div
        v-if="!narrow"
        class="plugin-connection-workbench__resizer"
        :class="{ 'is-dragging': dragWidth !== null }"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="copy.connResize"
        :aria-valuemin="180"
        :aria-valuemax="360"
        :aria-valuenow="sidebarWidth"
        @pointerdown="startResize"
        @pointermove="moveResize"
        @pointerup="endResize"
        @pointercancel="endResize"
        @keydown.left.prevent="keyResize(-16)"
        @keydown.right.prevent="keyResize(16)"
      />
    </component>

    <div class="plugin-connection-workbench__main">
      <header class="plugin-connection-workbench__topbar">
        <ElButton text :icon="narrow || sidebarHidden ? Expand : Fold" :title="toggleLabel" :aria-label="toggleLabel" @click="toggleSidebar" />
        <ElTag v-if="!ready" disable-transitions type="warning">{{ copy.waiting }}</ElTag>
        <div class="plugin-connection-workbench__current" :title="statusTitle || activeDetail || undefined">
          <span
            class="plugin-connection-workbench__dot"
            :class="{ 'is-live': connected }"
            role="img"
            :aria-label="connected ? statusLabel || copy.connConnected : copy.connDisconnected"
          />
          <span v-if="activeName" class="plugin-connection-workbench__current-name">{{ activeName }}</span>
          <ElTag v-if="active?.environment" size="small" disable-transitions :type="environmentTagType(active.environment)">{{ envName(active.environment) }}</ElTag>
          <span v-if="activeDetail" class="plugin-connection-workbench__current-detail">{{ activeDetail }}</span>
        </div>
        <div class="plugin-connection-workbench__actions">
          <ElButton
            v-if="readOnly !== null && readOnly !== undefined"
            :icon="readOnly ? Lock : Unlock"
            :type="readOnly ? undefined : 'warning'"
            plain
            :aria-pressed="readOnly ? 'true' : 'false'"
            :disabled="!ready"
            @click="emit('toggle-read-only', !readOnly)"
          >{{ readOnly ? copy.connReadOnly : copy.connWritable }}</ElButton>
          <slot name="top-actions" />
          <ElButton v-if="connectable && showDisconnect" :icon="SwitchButton" :loading="busy" :disabled="busy || disconnectDisabled" @click="emit('disconnect')">{{ disconnectLabel || copy.connDisconnect }}</ElButton>
          <ElButton v-else-if="connectable" type="primary" :icon="Connection" :loading="busy" :disabled="!ready || busy || connectDisabled" @click="emit('connect')">{{ connectLabel || copy.connConnect }}</ElButton>
          <ElDropdown v-if="$slots.more || active" trigger="click" placement="bottom-end">
            <ElButton text :icon="MoreFilled" :title="copy.connMore" :aria-label="copy.connMore" />
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem v-if="active" @click="emit('edit', active.profile.id)">{{ copy.connEdit }}</ElDropdownItem>
                <slot name="more" />
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
      </header>
      <slot name="tabs" />
      <div class="plugin-connection-workbench__workspace">
        <div v-if="connectable && !connected" class="plugin-connection-workbench__empty">
          <ElIcon class="plugin-connection-workbench__empty-icon" aria-hidden="true"><Connection /></ElIcon>
          <h2 class="plugin-connection-workbench__empty-title">{{ hasSaved ? emptyTitle : copy.connEmptyNoneTitle }}</h2>
          <p v-if="subtitle" class="plugin-connection-workbench__empty-text">{{ subtitle }}</p>
          <p v-if="!$slots.empty" class="plugin-connection-workbench__empty-hint">{{ hasSaved ? copy.connEmptyHint : copy.connEmptyNoneHint }}</p>
          <div class="plugin-connection-workbench__empty-actions">
            <ElButton v-if="!hasSaved" type="primary" :icon="Plus" :disabled="!ready || newDisabled" @click="emit('new')">{{ copy.connNew }}</ElButton>
            <ElButton v-else type="primary" :icon="Connection" :loading="busy" :disabled="!ready || busy || connectDisabled" @click="emit('connect')">{{ connectLabel || copy.connConnect }}</ElButton>
          </div>
          <div v-if="$slots.empty" class="plugin-connection-workbench__empty-extra"><slot name="empty" /></div>
          <div v-if="recent.length" class="plugin-connection-workbench__recent">
            <span class="plugin-connection-workbench__recent-title">{{ copy.connRecent }}</span>
            <ElButton v-for="item in recent" :key="item.profile.id" text :disabled="!ready || selectDisabled" @click="choose(item.profile.id)">
              <span class="plugin-connection-workbench__name">{{ item.profile.name }}</span>
              <ElTag v-if="item.environment" size="small" disable-transitions :type="environmentTagType(item.environment)">{{ envName(item.environment) }}</ElTag>
              <small v-if="describe(item.profile)" class="plugin-connection-workbench__detail">{{ describe(item.profile) }}</small>
            </ElButton>
          </div>
        </div>
        <slot v-else />
      </div>
    </div>

    <ElDialog v-model="moveOpen" :title="copy.connMoveTo" width="min(420px, 92vw)" append-to-body>
      <PluginConnectionMetaFields v-model="moveValue" :groups="knownGroups" :locale="locale" />
      <template #footer>
        <ElButton @click="moveOpen = false">{{ copy.connCancel }}</ElButton>
        <ElButton type="primary" @click="applyMove">{{ copy.connOk }}</ElButton>
      </template>
    </ElDialog>
    <ElDialog v-model="renameOpen" :title="copy.groupRename" width="min(380px, 92vw)" append-to-body>
      <ElInput v-model="renameValue" :maxlength="40" show-word-limit :aria-label="copy.groupNameLabel" @keydown.enter.prevent="applyRename" />
      <template #footer>
        <ElButton @click="renameOpen = false">{{ copy.connCancel }}</ElButton>
        <ElButton type="primary" :disabled="!renameValid" @click="applyRename">{{ copy.connOk }}</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.plugin-connection-workbench { --el-component-size: 28px; display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--app-surface); color: var(--app-text); font-size: var(--app-ui-font-size, 13px); }
.plugin-connection-workbench__side { position: relative; display: flex; flex: none; min-width: 180px; max-width: 360px; height: 100%; border-right: 1px solid var(--app-border); background: var(--app-sidebar, var(--app-muted)); }
.plugin-connection-workbench__sidebar { display: flex; flex: 1; flex-direction: column; min-width: 0; height: 100%; min-height: 0; padding: 8px 0 0; }
.plugin-connection-workbench__brand { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 2px 12px 8px; }
.plugin-connection-workbench__logo { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 5px; background: var(--app-accent-soft); color: var(--app-accent); font-size: 12px; font-weight: 600; }
.plugin-connection-workbench__title { min-width: 0; margin: 0; overflow: hidden; font-size: 14px; font-weight: 600; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.plugin-connection-workbench__list-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px 4px 12px; }
.plugin-connection-workbench__list-title { color: var(--app-text-muted); font-size: 12px; font-weight: 500; }
.plugin-connection-workbench__search { flex: none; width: auto; margin: 0 8px 6px; }
.plugin-connection-workbench__list { flex: 1; min-height: 0; }
/* The list is an ElTree; restyle its rows to the workbench density and accent highlight. */
.plugin-connection-workbench__tree { --el-tree-node-hover-bg-color: var(--app-hover, var(--app-surface-hover)); padding: 0 4px; background: transparent; color: var(--app-text); font-size: inherit; }
.plugin-connection-workbench__tree :deep(.el-tree-node__content) { height: auto; min-height: 28px; padding-top: 3px; padding-bottom: 3px; border-radius: 6px; }
.plugin-connection-workbench__tree :deep(.el-tree-node:focus > .el-tree-node__content) { background: transparent; }
.plugin-connection-workbench__tree :deep(.el-tree-node:focus-visible > .el-tree-node__content), .plugin-connection-workbench__resizer:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
.plugin-connection-workbench__tree :deep(.el-tree-node__content:hover) { background: var(--el-tree-node-hover-bg-color); }
.plugin-connection-workbench__tree.el-tree--highlight-current :deep(.el-tree-node.is-current > .el-tree-node__content) { background: var(--app-accent-soft); }
.plugin-connection-workbench__tree :deep(.el-tree-node.is-locked > .el-tree-node__content) { cursor: default; }
.plugin-connection-workbench__tree :deep(.el-tree-node.is-group > .el-tree-node__content) { color: var(--app-text-muted); font-size: 12px; font-weight: 500; user-select: none; }
.plugin-connection-workbench__tree :deep(.el-tree__empty-block) { min-height: 0; }
.plugin-connection-workbench__tree :deep(.el-tree__empty-text) { position: static; display: block; margin: 12px 8px; color: var(--app-text-muted); font-size: 12px; transform: none; }
.plugin-connection-workbench__group { display: flex; flex: 1; align-items: center; gap: 6px; min-width: 0; padding-right: 8px; }
.plugin-connection-workbench__group-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plugin-connection-workbench__count { flex: none; font-size: 11px; }
.plugin-connection-workbench__node { display: flex; flex: 1; align-items: center; gap: 6px; min-width: 0; padding-right: 8px; }
.plugin-connection-workbench__node-text { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.plugin-connection-workbench__node-line { display: flex; align-items: center; gap: 6px; min-width: 0; }
.plugin-connection-workbench__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plugin-connection-workbench__node-line .el-tag, .plugin-connection-workbench__current .el-tag, .plugin-connection-workbench__recent .el-tag { flex: none; }
.plugin-connection-workbench__detail { min-width: 0; overflow: hidden; color: var(--app-text-muted); font-family: var(--app-font-mono, monospace); font-size: 11px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.plugin-connection-workbench__dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--app-border-strong); }
.plugin-connection-workbench__dot.is-live { background: var(--el-color-success); }
.plugin-connection-workbench__footer { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 8px; border-top: 1px solid var(--app-border); }
.plugin-connection-workbench__footer :deep(.el-button + .el-button) { margin-left: 0; }
.plugin-connection-workbench__resizer { position: absolute; top: 0; right: -3px; bottom: 0; z-index: 2; width: 6px; cursor: col-resize; touch-action: none; }
.plugin-connection-workbench__resizer:hover, .plugin-connection-workbench__resizer.is-dragging { background: var(--app-accent-soft); }
.plugin-connection-workbench__main { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
.plugin-connection-workbench__topbar { display: flex; flex: none; align-items: center; gap: 8px; min-height: 44px; padding: 6px 12px 6px 6px; border-bottom: 1px solid var(--app-border); background: var(--app-surface); }
.plugin-connection-workbench__current { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; }
.plugin-connection-workbench__current-name { flex: none; max-width: 40%; overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.plugin-connection-workbench__current-detail { min-width: 0; overflow: hidden; color: var(--app-text-muted); font-family: var(--app-font-mono, monospace); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.plugin-connection-workbench__actions { display: flex; flex: none; align-items: center; gap: 8px; }
.plugin-connection-workbench__actions :deep(.el-button + .el-button), .plugin-connection-workbench__topbar > :deep(.el-button) { margin-left: 0; }
.plugin-connection-workbench__actions > :deep(.el-button:not(.is-text)) { height: 28px; padding: 0 10px; }
.plugin-connection-workbench__workspace { position: relative; display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; }
/* Not connected: icon, state title, what the plugin does, the next step, then plugin extras. Sits a little above centre. */
.plugin-connection-workbench__empty { display: flex; flex-direction: column; align-items: center; gap: 10px; width: min(440px, calc(100% - 32px)); margin: auto; padding: 32px 24px 12vh; text-align: center; }
.plugin-connection-workbench__empty-icon { display: grid; place-items: center; width: 56px; height: 56px; margin-bottom: 4px; border-radius: 16px; background: color-mix(in srgb, var(--app-accent) 12%, transparent); color: var(--app-accent); font-size: 26px; }
.plugin-connection-workbench__empty-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--app-text); }
.plugin-connection-workbench__empty-text { margin: 0; color: var(--app-text-regular, var(--app-text)); font-size: 13px; line-height: 1.6; }
.plugin-connection-workbench__empty-hint { margin: 0; color: var(--app-text-muted); font-size: 12px; line-height: 1.6; }
.plugin-connection-workbench__empty-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 6px; }
.plugin-connection-workbench__empty-actions :deep(.el-button + .el-button) { margin-left: 0; }
.plugin-connection-workbench__empty :deep(.el-button + .el-button) { margin-left: 0; }
/* Plugin extras (its own hint and secondary buttons) read as part of the card, not a second block. */
.plugin-connection-workbench__empty-extra { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; margin-top: 2px; color: var(--app-text-muted); font-size: 12px; line-height: 1.6; }
.plugin-connection-workbench__empty-extra :deep(p) { margin: 0; max-width: 360px; }
.plugin-connection-workbench__empty-extra :deep(.el-button:not(.el-button--primary)) { --el-button-bg-color: transparent; }
.plugin-connection-workbench__recent { margin-top: 8px; padding-top: 12px; border-top: 1px solid var(--app-border); }
.plugin-connection-workbench__recent { display: flex; flex-direction: column; align-items: stretch; gap: 2px; width: 100%; }
.plugin-connection-workbench__recent-title { color: var(--app-text-muted); font-size: 12px; text-align: left; }
.plugin-connection-workbench__recent :deep(.el-button) { justify-content: flex-start; width: 100%; margin-left: 0; }
.plugin-connection-workbench__recent :deep(.el-button > span) { display: flex; align-items: center; gap: 6px; min-width: 0; }
.plugin-connection-workbench__recent .plugin-connection-workbench__detail { margin-left: auto; }
.plugin-connection-workbench__security-text { max-height: 50vh; overflow: auto; font-size: 12px; line-height: 1.7; white-space: pre-line; overflow-wrap: anywhere; }
/* Narrow pages: the list lives in the drawer (see sideHost); keep a CSS fallback and trim the bar. */
@media (max-width: 720px) {
  .plugin-connection-workbench__side, .plugin-connection-workbench__resizer { display: none; }
  .plugin-connection-workbench__topbar { padding: 6px 8px 6px 4px; gap: 6px; }
  .plugin-connection-workbench__current-detail { display: none; }
  .plugin-connection-workbench__current-name { max-width: none; flex: 0 1 auto; }
}
</style>

<style>
/* Teleported overlays (drawer, menus, popover) are outside the scoped root. */
.plugin-connection-workbench__drawer .el-drawer__body { display: flex; padding: 0; background: var(--app-sidebar, var(--app-muted)); }
.el-dropdown-menu__item.plugin-connection-workbench__danger:not(.is-disabled) { color: var(--el-color-danger); }
.plugin-connection-workbench__security { max-width: calc(100vw - 24px); }
</style>
