#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { start } from '../lib/runtime.mjs';
import { formatMcdemo } from './format.mjs';
import { KEYWORDS, MAX_LINE_LENGTH, lintMcdemo } from './lint.mjs';
import { discoverTests, languageFeature, runTests, treeChildren } from './providers.mjs';

const manifest = JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8'));

const invalid = message => Object.assign(new Error(message), { code: -32602 });
const isLine = value => Number.isSafeInteger(value) && value >= 1;

const LINTER_TRIGGERS = new Set(['open', 'save', 'type']);
const MAX_PACKAGE_JSON_BYTES = 1024 * 1024;
const MAX_DETECTED_TASKS = 64;
const SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9:._@/-]{0,63}$/;
const zh = locale => typeof locale === 'string' && locale.toLowerCase().startsWith('zh');
const singleLine = (value, max) => {
  const text = String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

// Static `demo:` command-palette results; the host filters nothing, so the
// provider matches the query itself.
const SEARCH_ITEMS = [
  {
    id: 'show-counter',
    title: { en: 'Show the showcase counter', zh: '查看示例计数器' },
    detail: { en: 'Runs the read-only command Process Showcase: Show Counter', zh: '运行只读命令“进程示例：查看计数器”' },
    keywords: 'counter show value 计数',
    target: { type: 'command', command: 'contributions-process-showcase.show' },
  },
  {
    id: 'plugin-docs',
    title: { en: 'Plugin documentation (example.com)', zh: '插件文档（example.com）' },
    detail: { en: 'Opens https://example.com/mincode/plugins in the system browser', zh: '在系统浏览器中打开 https://example.com/mincode/plugins' },
    keywords: 'docs documentation help plugin 文档 帮助',
    target: { type: 'url', url: 'https://example.com/mincode/plugins' },
  },
];

function groupFor(name) {
  if (/^(build|compile|bundle)/.test(name)) return 'build';
  if (/^test/.test(name)) return 'test';
  if (/^(lint|format|typecheck|check)/.test(name)) return 'lint';
  if (/^(dev|start|serve|preview)/.test(name)) return 'run';
  if (/^(deploy|release|publish)/.test(name)) return 'deploy';
  return 'other';
}

async function readCounter(host) {
  const value = await host('host.storage.get', { key: 'counter' });
  const count = value === null ? 0 : value;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Stored counter must be a non-negative safe integer');
  return count;
}

start(host => ({
  // Formatter action: the host sends {formatter, languageId, fileName,
  // relativePath? (only with workspace.read), text, range?, options}. The
  // result must be exactly {text} (the whole document) or {unchanged: true}.
  async format(payload) {
    const { text, options, range } = payload ?? {};
    if (typeof text !== 'string') throw invalid('text must be a string');
    if (!options || !Number.isSafeInteger(options.tabSize) || options.tabSize < 1 || options.tabSize > 32
      || typeof options.insertSpaces !== 'boolean' || (options.eol !== '\n' && options.eol !== '\r\n')) {
      throw invalid('options must be {tabSize, insertSpaces, eol}');
    }
    if (range !== undefined && (!range || !isLine(range.startLineNumber) || !isLine(range.endLineNumber)
      || range.endLineNumber < range.startLineNumber)) {
      throw invalid('range is invalid');
    }
    const formatted = formatMcdemo(text, options, range);
    return formatted === text ? { unchanged: true } : { text: formatted };
  },

  // Data widget action: the host sends {widget} and renders the items as plain
  // text. The host passes no locale, so labels carry both languages.
  async 'dashboard.summary'(payload) {
    if (payload?.widget !== 'counter') throw invalid('unknown dashboard widget');
    const count = await readCounter(host);
    return {
      items: [
        { label: 'Counter / 计数', value: count, severity: count > 0 ? 'success' : 'normal',
          hint: 'Run “Process Showcase: Increment Counter”. / 运行“进程示例：计数器加一”。' },
      ],
      footnote: manifest.name,
      updatedAt: new Date().toISOString(),
    };
  },

  // Linter action (contributes.linters): the host sends {linter, languageId,
  // fileName, relativePath? (workspace.read), text, trigger} and expects exactly
  // {diagnostics: [...]} with 1-based ranges.
  async lint(payload) {
    const { linter, text, trigger } = payload ?? {};
    if (linter !== 'mcdemo') throw invalid('unknown linter');
    if (typeof text !== 'string') throw invalid('text must be a string');
    if (!LINTER_TRIGGERS.has(trigger)) throw invalid('trigger must be open, save or type');
    return { diagnostics: lintMcdemo(text) };
  },

  // Search provider action (contributes.searchProviders, prefix `demo:`): the
  // host sends {provider, query, locale} and expects {items: [...]}.
  async 'palette.search'(payload) {
    const { provider, query, locale } = payload ?? {};
    if (provider !== 'demo') throw invalid('unknown search provider');
    if (typeof query !== 'string') throw invalid('query must be a string');
    const language = zh(locale) ? 'zh' : 'en';
    const needle = query.trim().toLowerCase();
    const items = SEARCH_ITEMS
      .filter(item => !needle || `${item.title[language]} ${item.detail[language]} ${item.keywords}`.toLowerCase().includes(needle))
      .map(item => ({ id: item.id, title: item.title[language], detail: item.detail[language], target: item.target }));
    return { items };
  },

  // AI catalogs: search returns display data only; installation returns
  // content only after the user presses Add. The demo never connects itself.
  async 'catalog.search'(payload) {
    const { catalog, kind, query, locale } = payload ?? {};
    if (catalog !== (kind === 'mcp' ? 'demo-connectors' : 'demo-skills') || !['mcp', 'skill'].includes(kind)) throw invalid('unknown catalog');
    if (typeof query !== 'string') throw invalid('query must be a string');
    const name = zh(locale) ? 'Showcase 演示' : 'Showcase demo';
    const description = kind === 'mcp' ? 'Demo HTTP connector (manual connection only)' : 'Demo skill for reviewing changes';
    const needle = query.trim().toLowerCase();
    return { items: !needle || `${name} ${description}`.toLowerCase().includes(needle)
      ? [{ id: 'showcase-demo', name, description }] : [] };
  },
  async 'catalog.install'(payload) {
    const { catalog, kind, id } = payload ?? {};
    if (catalog !== (kind === 'mcp' ? 'demo-connectors' : 'demo-skills') || !['mcp', 'skill'].includes(kind) || id !== 'showcase-demo') throw invalid('unknown catalog item');
    return { content: kind === 'mcp'
      ? JSON.stringify({ mcpServers: { 'showcase-demo': { url: 'http://127.0.0.1:18765/mcp' } } })
      : '---\nname: showcase-demo\ndescription: Review changes before committing\n---\nSummarize changes and list tests that were run.\n' };
  },

  // AI context provider action (contributes.aiContextProviders, `@demo`): the
  // host sends {provider, argument?, locale} and expects {text, title?,
  // truncated?}. It never receives the conversation. Keep it free of host
  // calls so it answers quickly: the SDK runs one action at a time.
  async 'ai.context'(payload) {
    const { provider, argument } = payload ?? {};
    if (provider !== 'demo') throw invalid('unknown context provider');
    if (argument !== undefined && typeof argument !== 'string') throw invalid('argument must be a string');
    const topic = singleLine(argument ?? '', 256);
    const keywords = Object.values(KEYWORDS).map(help => `- ${help}`).join('\n');
    const text = [
      'The mcdemo language is a made-up task file format used by the MinCode plugin templates.',
      topic ? `The user asked about: ${topic}` : '',
      '',
      'Keywords:',
      keywords,
      '',
      `Lint rules: TODO markers are reported as info, trailing whitespace as a warning, and lines longer than ${MAX_LINE_LENGTH} characters as a warning.`,
      'Blocks (task, when … else … end) are indented one level per nesting depth.',
    ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');
    return { text, title: topic ? `mcdemo: ${topic.slice(0, 40)}` : 'mcdemo language' };
  },

  // Task detection provider (contributes.tasks, kind "provider"): runs only
  // when the user clicks Detect tasks. The host sends {provider, project:
  // {name, root?}, platform}; root is present because the plugin declares
  // workspace.read. The result is {tasks: [...]} and the host re-validates it.
  async 'tasks.detect'(payload) {
    const { provider, project } = payload ?? {};
    if (provider !== 'npm') throw invalid('unknown task provider');
    const root = project?.root;
    if (typeof root !== 'string' || !path.isAbsolute(root)) return { tasks: [] };
    const file = path.join(root, 'package.json');
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || info.size > MAX_PACKAGE_JSON_BYTES) return { tasks: [] };
    let scripts;
    try {
      scripts = JSON.parse(await readFile(file, 'utf8'))?.scripts;
    } catch {
      return { tasks: [] };
    }
    if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return { tasks: [] };
    const tasks = [];
    const ids = new Set();
    for (const [name, script] of Object.entries(scripts)) {
      if (tasks.length >= MAX_DETECTED_TASKS) break;
      if (!SCRIPT_NAME.test(name) || typeof script !== 'string') continue;
      const id = `npm:${name.toLowerCase().replace(/[^a-z0-9:._-]/g, '-')}`.slice(0, 64);
      if (ids.has(id)) continue;
      ids.add(id);
      tasks.push({
        id,
        title: `npm run ${name}`,
        detail: singleLine(script, 200) || undefined,
        group: groupFor(name),
        command: 'npm',
        args: ['run', name],
        cwd: '${projectRoot}',
      });
    }
    return { tasks };
  },

  // Tree view (contributes.treeViews): the host sends {view, parent, locale,
  // project?} when the user expands the view (parent null) or a node, and
  // expects {items: [...]} for that level only.
  async 'tree.mcdemo'(payload) {
    if (payload?.view !== 'mcdemo') throw invalid('unknown tree view');
    if (payload.parent !== null && typeof payload.parent !== 'string') throw invalid('parent must be a string or null');
    return treeChildren(payload);
  },

  // Language features (contributes.languageFeatures): hover and completion for
  // mcdemo. The host sends {provider, feature, languageId, fileName, text,
  // startLine, position, locale, ...}; results are shown as plain text.
  async 'language.mcdemo'(payload) {
    const { provider, feature, text, position } = payload ?? {};
    if (provider !== 'mcdemo') throw invalid('unknown language feature provider');
    if (feature !== 'hover' && feature !== 'completion') throw invalid('feature must be hover or completion');
    if (typeof text !== 'string' || !isLine(position?.line) || !isLine(position?.column)) throw invalid('text and position are required');
    return languageFeature(payload);
  },

  // Test provider (contributes.testProviders): discovery lists one node per
  // .mcdemo file with its tasks as children; running applies made-up rules.
  async 'tests.discover'(payload) {
    if (payload?.provider !== 'mcdemo') throw invalid('unknown test provider');
    return discoverTests(payload);
  },

  async 'tests.run'(payload) {
    if (payload?.provider !== 'mcdemo') throw invalid('unknown test provider');
    if (!Array.isArray(payload.tests) || !payload.tests.every(id => typeof id === 'string')) throw invalid('tests must be a list of ids');
    return runTests(payload);
  },

  // Read command behind the `demo:` search result and the
  // mincode://contributions-process-showcase/counter/show deep link.
  async show() {
    const count = await readCounter(host);
    return { count, message: `The showcase counter is ${count}. / 示例计数器为 ${count}。` };
  },

  // Command action used by the walkthrough's command step.
  async bump() {
    const previous = await readCounter(host);
    if (previous === Number.MAX_SAFE_INTEGER) throw new Error('Counter limit reached');
    const count = previous + 1;
    if (await host('host.storage.set', { key: 'counter', value: count }) !== true) {
      throw new Error('Host did not confirm counter storage');
    }
    return { count };
  },
}), {
  hostTimeoutMs: 5_000,
  allowNullPayload: true,
  strictPayloadString: true,
  errors: { timeout: 'Host request timed out', busy: 'An action is already running' },
  // Go Invoke unwraps this object once; do not JSON.stringify the action result.
  formatResult: result => ({ result }),
  validateInitialize(params) {
    const version = params?.runtimeProtocolVersion ?? params?.apiVersion;
    if (version !== 1) {
      throw Object.assign(new Error('Unsupported runtime protocol version'), { code: -32602 });
    }
    return { manifestApiVersion: manifest.apiVersion };
  },
});
