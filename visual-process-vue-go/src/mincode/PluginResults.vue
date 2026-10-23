<script setup>
import { computed, inject, ref, watch } from 'vue';
import { ElEmpty, ElInput, ElTabs, ElTabPane } from 'element-plus';
import { pluginLocaleKey, pluginMessages } from './messages.mjs';
const locale = inject(pluginLocaleKey, ref('zh'));
const copy = computed(() => pluginMessages(locale.value));
const props = defineProps({ data: Object });
const query = ref(''), tab = ref('overview'), selected = ref(null), level = ref('all');
watch(() => props.data, () => { selected.value = null; query.value = ''; tab.value = 'overview'; level.value = 'all'; });
const limitations = computed(() => [...(props.data.limitations || []), ...(props.data.uncovered || []), ...(props.data.warning ? [props.data.warning] : [])]);
const json = value => JSON.stringify(value, null, 2);
</script>
<template>
  <ElTabs v-model="tab">
    <ElTabPane :label="copy.overview" name="overview">
      <div class="result-toolbar"><ElInput v-model="query" clearable :placeholder="copy.filterPlaceholder" :aria-label="copy.filter" /></div>
      <slot :query="query" :selected="selected" :level="level" :set-selected="value => selected = value" :set-level="value => level = value" />
    </ElTabPane>
    <ElTabPane :label="`${copy.limitations} (${limitations.length})`" name="limitations"><ul class="limitations-list"><li v-for="(item, i) in limitations" :key="i">{{ item }}</li></ul><ElEmpty v-if="!limitations.length" :description="copy.noNotes" :image-size="48" /></ElTabPane>
    <ElTabPane :label="copy.raw" name="raw"><pre tabindex="0">{{ json(data) }}</pre></ElTabPane>
  </ElTabs>
</template>
