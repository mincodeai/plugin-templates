// Pure helpers for the connection workbench shell: grouping, search and the
// group/environment round trip through profile export/import. Bundled into each
// plugin; never import the host application.
import { messages } from './messages.mjs';

export const ENVIRONMENTS = ['dev', 'test', 'staging', 'prod'];
const TAG_TYPES = { dev: 'info', test: 'primary', staging: 'warning', prod: 'danger' };
const MAX_GROUP_RUNES = 40;
const forbiddenGroupChars = /[\p{Cc}\u2028\u2029]/u;

/** Element Plus tag type for an environment code; '' when unset or unknown. */
export function environmentTagType(env) {
  return Object.hasOwn(TAG_TYPES, env) ? TAG_TYPES[env] : '';
}

const collation = locale => (locale === 'zh' ? 'zh-Hans-CN' : 'en');
const compareNames = locale => (a, b) => a.localeCompare(b, collation(locale)) || (a < b ? -1 : a > b ? 1 : 0);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Trimmed group name when it satisfies the group rules, otherwise ''. */
function cleanGroup(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  if (!name || [...name].length > MAX_GROUP_RUNES || forbiddenGroupChars.test(name)) return '';
  if (typeof name.isWellFormed === 'function' && !name.isWellFormed()) return '';
  return name;
}
const cleanEnvironment = value => {
  const env = typeof value === 'string' ? value.trim() : '';
  return ENVIRONMENTS.includes(env) ? env : '';
};
function entryFor(meta, id) {
  if (!id || !isObject(meta) || !Object.hasOwn(meta, id) || !isObject(meta[id])) return { group: '', environment: '' };
  return { group: cleanGroup(meta[id].group), environment: cleanEnvironment(meta[id].environment) };
}

// Environment search terms: the code plus both localized names, whatever the page locale.
const environmentTerms = Object.fromEntries(ENVIRONMENTS.map(env => [env,
  [env, messages.zh[`env_${env}`], messages.en[`env_${env}`]].map(term => term.toLowerCase())]));

/**
 * Groups saved connections by their meta. Temporary connections (empty id) are
 * left out — the shell renders them separately. Meta for unknown IDs is
 * ignored. Named groups sort by locale collation, ungrouped ('') comes last,
 * and items keep the order of `profiles`. A non-empty `query` keeps whole
 * groups whose name matches, plus individual connections whose name,
 * `detail(profile)` or environment (code, zh or en name) matches.
 */
export function groupConnections(profiles, meta, { query = '', locale = 'zh', detail = () => '' } = {}) {
  const needle = String(query ?? '').trim().toLowerCase();
  const byName = new Map();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (!profile?.id) continue;
    const { group, environment } = entryFor(meta, profile.id);
    if (!byName.has(group)) byName.set(group, []);
    byName.get(group).push({ profile, group, environment });
  }
  const matches = ({ profile, environment }) => {
    const texts = [profile.name, detail(profile)].map(text => String(text ?? '').toLowerCase());
    if (environment) texts.push(...environmentTerms[environment]);
    return texts.some(text => text.includes(needle));
  };
  const groups = [];
  for (const [name, items] of byName) {
    const kept = !needle || (name && name.toLowerCase().includes(needle)) ? items : items.filter(matches);
    if (kept.length) groups.push({ name, items: kept });
  }
  const compare = compareNames(locale);
  return groups.sort((a, b) => (!a.name ? 1 : !b.name ? -1 : compare(a.name, b.name)));
}

/** Unique, sorted, non-empty group names used in `meta`. */
export function groupNames(meta, locale = 'zh') {
  if (!isObject(meta)) return [];
  const names = new Set(Object.values(meta).map(entry => (isObject(entry) ? cleanGroup(entry.group) : '')).filter(Boolean));
  return [...names].sort(compareNames(locale));
}

/** Export: copies each exported profile and attaches its non-empty group/environment. */
export function withMeta(exported, meta) {
  return (Array.isArray(exported) ? exported : []).map(item => {
    if (!isObject(item)) return item;
    const { group, environment } = entryFor(meta, typeof item.id === 'string' ? item.id : '');
    return { ...item, ...(group ? { group } : {}), ...(environment ? { environment } : {}) };
  });
}

/**
 * Import, before calling the plugin's own importProfiles action: strips
 * `group`/`environment` from each item and returns the valid ones as pending
 * `{ name, group, environment }`. Items without those keys (old exports) are
 * returned as the same objects.
 */
export function metaFromImport(items) {
  if (!Array.isArray(items)) return { pending: [], items };
  const pending = [];
  const cleaned = items.map(item => {
    if (!isObject(item) || !(Object.hasOwn(item, 'group') || Object.hasOwn(item, 'environment'))) return item;
    const { group: rawGroup, environment: rawEnvironment, ...rest } = item;
    const group = cleanGroup(rawGroup), environment = cleanEnvironment(rawEnvironment);
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (name && (group || environment)) pending.push({ name, group, environment });
    return rest;
  });
  return { pending, items: cleaned };
}

/**
 * Import, after the plugin's importProfiles action: matches pending meta to
 * saved profiles by exact (trimmed) name → `[{ id, group, environment }]`.
 * Pass only the profiles the import created so a skipped duplicate never
 * lands on an existing connection. Unmatched or ambiguous names (repeated in
 * `pending` or among `profiles`) are skipped.
 */
export function metaAssignments(pending, profiles) {
  const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  const pendingNames = new Map(), profileNames = new Map(), idByName = new Map();
  const list = Array.isArray(pending) ? pending.filter(isObject) : [];
  for (const entry of list) count(pendingNames, String(entry.name ?? '').trim());
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (!profile?.id || typeof profile.name !== 'string') continue;
    const name = profile.name.trim();
    count(profileNames, name);
    idByName.set(name, profile.id);
  }
  const out = [];
  for (const entry of list) {
    const name = String(entry.name ?? '').trim();
    if (!name || pendingNames.get(name) !== 1 || profileNames.get(name) !== 1) continue;
    out.push({ id: idByName.get(name), group: cleanGroup(entry.group), environment: cleanEnvironment(entry.environment) });
  }
  return out;
}
