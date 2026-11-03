#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createContextAPI, createDecorationsAPI, createNotificationsAPI, start } from '../lib/runtime.mjs';
import { formatMcdemo } from './format.mjs';
import { KEYWORDS, MAX_LINE_LENGTH, lintMcdemo } from './lint.mjs';
import { discoverTests, languageFeature, runTests, treeChildren } from './providers.mjs';

const manifest = JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8'));

const invalid = message => Object.assign(new Error(message), { code: -32602 });
const isLine = value => Number.isSafeInteger(value) && value >= 1;

const LINTER_TRIGGERS = new Set(['open', 'save', 'type']);
const LANGUAGE_FEATURES = new Set(['hover', 'completion', 'definition', 'documentSymbol']);
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

// Data providers (host 0.3.0). The host calls each of these read actions
// only after a user action (expanding the session source, opening a session,
// pressing Plugin Generate, expanding a folder), builds the payload itself and
// re-validates every result: text is shown as plain text, never Markdown or
// HTML. The entry IDs below match plugin.json.
const DATA_PROVIDER_ID = 'showcase';
const SESSIONS_MAX = 200; // sessionSources limits.sessionsMax
const MESSAGES_MAX = 200; // sessionSources limits.messagesMax
const SESSION_ROLES = new Set(['user', 'assistant', 'system', 'tool']);
const LOG_MAX = 1000;

// Three demo sessions shown while this plugin's storage holds none. A real
// session source reads its own storage or its own service: never another
// tool's session folders (~/.claude, ~/.codex, …).
function demoSessions(language) {
  const zhText = language === 'zh';
  const at = (day, hour) => Date.UTC(2026, 10, day, hour, 0, 0);
  return [
    {
      id: 'demo-welcome',
      title: zhText ? '欢迎使用插件会话来源' : 'Welcome to plugin session sources',
      model: 'showcase-demo',
      lastAt: at(1, 9),
      messages: [
        { role: 'user', text: zhText ? '这个来源从哪里读会话？' : 'Where does this source read sessions from?', timestamp: at(1, 8) },
        { role: 'assistant', model: 'showcase-demo', timestamp: at(1, 9),
          text: zhText ? '从插件自己的存储（host.storage 的 sessions 键）读取；没有存储时显示这三个示例。MinCode 只在你展开来源时列出会话，点击会话时才读取消息。'
            : 'From the plugin\'s own storage (the sessions key of host.storage), or these three demos when nothing is stored. MinCode lists sessions only when you expand the source and reads messages only when you open a session.' },
      ],
    },
    {
      id: 'demo-plain-text',
      title: zhText ? '消息只按纯文本显示' : 'Messages are plain text',
      model: 'showcase-demo',
      lastAt: at(2, 14),
      messages: [
        { role: 'user', text: zhText ? '能显示粗体和链接吗？' : 'Can a message show bold text and links?', timestamp: at(2, 13) },
        { role: 'assistant', model: 'showcase-demo', timestamp: at(2, 14),
          text: zhText ? '不能。下面这行原样显示，不会变粗，也不能点击：\n<b>不是粗体</b> [MinCode 插件文档](https://example.com/mincode/plugins)'
            : 'No. The next line is shown exactly as written, not bold and not clickable:\n<b>not bold</b> [MinCode plugin docs](https://example.com/mincode/plugins)' },
      ],
    },
    {
      id: 'demo-read-only',
      title: zhText ? '插件会话只读' : 'Plugin sessions are read only',
      lastAt: at(3, 18),
      messages: [
        { role: 'system', text: zhText ? '插件会话不能在终端中继续、改名或删除，也没有深度链接。' : 'Plugin sessions cannot be resumed in a terminal, renamed or deleted, and have no deep links.', timestamp: at(3, 18) },
      ],
    },
  ];
}

async function readSessions(host, language) {
  const stored = await host('host.storage.get', { key: 'sessions' });
  return Array.isArray(stored) ? stored : demoSessions(language);
}

async function logLine(host, message) {
  const text = message.length > LOG_MAX ? `${message.slice(0, LOG_MAX - 1)}…` : message;
  await host('host.log', { level: 'info', message: text }).catch(() => {});
}

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

async function writeStorage(host, key, value) {
  if (await host('host.storage.set', { key, value }) !== true) throw new Error(`Host did not confirm ${key} storage`);
}

async function readDemo(host) {
  return await host('host.storage.get', { key: 'demo' }) === true;
}

// Notification buttons (host.notify `actions`, host 0.3.0; older hosts ignore
// them and still show the notification). At most 2, titles of at most 24
// characters, commands of this plugin only and without arguments. MinCode
// runs a non-read command only after a confirmation that names the plugin and
// the command's manifest title, never the button text, so "Reset" below is
// confirmed as "Process Showcase: Reset Counter".
const NOTIFICATION_ACTIONS = [
  { id: 'show', title: 'Show / 查看', command: 'contributions-process-showcase.show' },
  { id: 'reset', title: 'Reset… / 重置…', command: 'contributions-process-showcase.reset' },
];
const NOTIFY_DELAYS = new Set([0, 5]);

// host.notify fails with -32602 for an invalid button (nothing is posted) and
// with -32005 beyond 10 per minute; the demo logs it and keeps going.
async function postDemoNotification(host) {
  const [count, demo] = [await readCounter(host), await readDemo(host)];
  try {
    return await createNotificationsAPI(host).notify({
      title: demo ? 'Demo mode on / 演示模式已开启' : 'Demo mode off / 演示模式已关闭',
      body: `Counter / 计数：${count}`,
      level: 'info',
      viewId: 'settings',
      actions: NOTIFICATION_ACTIONS,
    });
  } catch (error) {
    await host('host.log', { level: 'warn', message: `host.notify failed (${error?.code ?? 'error'}): ${error?.message ?? error}` }).catch(() => {});
    return null;
  }
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

  // Language features (contributes.languageFeatures): hover, completion,
  // definition and documentSymbol for mcdemo, all from one read action. The
  // host sends {provider, feature, languageId, fileName, text, startLine,
  // position?, locale, ...}: position for hover, completion and definition;
  // documentSymbol gets the whole document and no position. The host
  // re-validates every result and renders it as plain text. Definitions stay
  // in this document (no `path`), so they need no workspace.read.
  async 'language.mcdemo'(payload) {
    const { provider, feature, text, startLine, position } = payload ?? {};
    if (provider !== 'mcdemo') throw invalid('unknown language feature provider');
    if (!LANGUAGE_FEATURES.has(feature)) throw invalid('feature must be hover, completion, definition or documentSymbol');
    if (typeof text !== 'string' || !isLine(startLine)) throw invalid('text and startLine are required');
    if (feature !== 'documentSymbol' && (!isLine(position?.line) || !isLine(position?.column))) throw invalid('position is required');
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

  // Session source (contributes.sessionSources). One read action answers both
  // requests: {source, request: "list", scope: "workspace" | "all",
  // project?: {name, root?}, locale} => {sessions} and {source, request:
  // "messages", session, locale} => {messages}. `project` comes only with the
  // workspace scope (root only with workspace.read). The host keeps at most
  // 200 sessions and the last 200 messages, drops invalid items and shows
  // every text as plain text.
  async 'sessions.read'(payload) {
    const { source, request, scope, project, session, locale } = payload ?? {};
    if (source !== DATA_PROVIDER_ID) throw invalid('unknown session source');
    const language = zh(locale) ? 'zh' : 'en';
    if (request === 'list') {
      if (scope !== 'workspace' && scope !== 'all') throw invalid('scope must be workspace or all');
      await logLine(host, `sessions.read list scope=${scope}${project?.name ? ` project=${project.name}` : ''}`);
      const where = scope === 'workspace'
        ? (language === 'zh' ? `工作区项目 ${project?.name ?? ''}` : `Workspace project ${project?.name ?? ''}`)
        : (language === 'zh' ? '全部' : 'All');
      const sessions = (await readSessions(host, language))
        .filter(item => item && typeof item.id === 'string')
        .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
        .slice(0, SESSIONS_MAX)
        .map(item => ({
          id: item.id,
          title: singleLine(item.title ?? '', 200),
          detail: singleLine(item.detail ?? where, 200),
          ...(item.model ? { model: singleLine(item.model, 64) } : {}),
          ...(Number.isSafeInteger(item.lastAt) ? { lastAt: item.lastAt } : {}),
          messageCount: Array.isArray(item.messages) ? item.messages.length : 0,
        }));
      return { sessions };
    }
    if (request === 'messages') {
      if (typeof session !== 'string') throw invalid('session must be a string');
      await logLine(host, `sessions.read messages session=${session}`);
      const found = (await readSessions(host, language)).find(item => item?.id === session);
      if (!found) throw invalid('unknown session');
      const messages = (Array.isArray(found.messages) ? found.messages : [])
        .filter(message => SESSION_ROLES.has(message?.role) && typeof message.text === 'string')
        .slice(-MESSAGES_MAX)
        .map(({ role, text, timestamp, model }) => ({
          role, text,
          ...(Number.isSafeInteger(timestamp) ? { timestamp } : {}),
          ...(typeof model === 'string' && model ? { model: singleLine(model, 64) } : {}),
        }));
      return { messages };
    }
    throw invalid('request must be list or messages');
  },

  // Commit message provider (contributes.scmCommitMessage). Runs only when
  // the user presses Plugin Generate in the Git panel. The host sends {provider,
  // repository: {name}, branch?, files: [{path, status, oldPath?}],
  // omittedFiles, diff, truncated, filesTruncated, locale}: staged changes
  // only, without .env-like files (counted in omittedFiles, names never
  // sent), diff cut to 64 KiB. The result {message} only fills the draft;
  // MinCode never commits it.
  async 'commit.draft'(payload) {
    const { provider, repository, files, omittedFiles, truncated } = payload ?? {};
    if (provider !== DATA_PROVIDER_ID) throw invalid('unknown commit message provider');
    if (!Array.isArray(files) || !files.every(file => typeof file?.path === 'string' && typeof file.status === 'string')) {
      throw invalid('files must be a list of {path, status}');
    }
    await logLine(host, `commit.draft repository=${repository?.name ?? ''} files=${files.map(file => file.path).join(', ') || '-'} omitted=${omittedFiles ?? 0} diffTruncated=${truncated === true}`);
    const counts = new Map();
    for (const file of files) counts.set(file.status, (counts.get(file.status) ?? 0) + 1);
    const subject = files.length
      ? `chore(showcase): update ${files.length} ${files.length === 1 ? 'file' : 'files'}`
      : 'chore(showcase): update files';
    const body = [...counts].map(([status, count]) => `- ${count} ${status}`).join('\n');
    return { message: body ? `${subject}\n\n${body}` : subject };
  },

  // File decoration provider (contributes.fileDecorations). The host asks for
  // one folder at a time: {provider, project: {name, root}, directory ("" is
  // the project root), names, locale}; sensitive names (.env, …) are never
  // sent. Answer only for names in the request (others are dropped): a badge
  // of 1-2 characters and/or a colour token (accent, success, warning,
  // danger, info, muted), never a CSS colour. The TODO marker has no tooltip
  // on purpose: MinCode then names the colour for screen readers ("Warning").
  async 'decorations.read'(payload) {
    const { provider, directory, names, locale } = payload ?? {};
    if (provider !== DATA_PROVIDER_ID) throw invalid('unknown file decoration provider');
    if (typeof directory !== 'string') throw invalid('directory must be a string');
    if (!Array.isArray(names) || !names.every(name => typeof name === 'string')) throw invalid('names must be a list of strings');
    await logLine(host, `decorations.read directory="${directory}" names=${names.length}: ${names.join(', ')}`);
    const markdown = zh(locale) ? 'Markdown 文档' : 'Markdown document';
    const decorations = {};
    for (const name of names) {
      if (/^TODO(\.[^.]*)?$/i.test(name)) decorations[name] = { color: 'warning' };
      else if (/\.md$/i.test(name)) decorations[name] = { badge: 'M', color: 'info', tooltip: markdown };
    }
    return { decorations };
  },

  // Command Process Showcase: Refresh File Markers. host.decorations.refresh
  // (host 0.3.0) carries no data: MinCode re-requests the folders it shows,
  // at most once every 2 seconds per plugin ({scheduled: false} otherwise).
  // It needs workspace.read and a fileDecorations entry; older hosts answer
  // -32601, which the SDK turns into {scheduled: false}.
  async 'decorations.refresh'() {
    return createDecorationsAPI(host).refresh();
  },

  // Tray and palette command (write): flips demo mode, publishes it as the
  // context key showcase.demo (usable in a command `when`; context is
  // cleared whenever the process stops) and posts a notification with buttons.
  async toggle() {
    const demo = !(await readDemo(host));
    await writeStorage(host, 'demo', demo);
    await createContextAPI(host).set('showcase.demo', demo);
    const notified = await postDemoNotification(host);
    return { demo, notified: notified !== null };
  },

  // Dangerous command behind the notification's Reset button.
  async reset() {
    await writeStorage(host, 'counter', 0);
    return { count: 0 };
  },

  // Settings page (contributes.settingsPages): read-only state for display.
  async 'settings.state'() {
    return { count: await readCounter(host), demo: await readDemo(host) };
  },

  // Settings page button. A 5-second delay leaves time to switch to another
  // app: MinCode in the background also shows a system notification, which
  // never has buttons.
  async 'notify.demo'(payload) {
    const delaySeconds = payload.delaySeconds ?? 0;
    if (!NOTIFY_DELAYS.has(delaySeconds)) throw invalid('delaySeconds must be 0 or 5');
    if (delaySeconds === 0) await postDemoNotification(host);
    else setTimeout(() => { postDemoNotification(host).catch(() => {}); }, delaySeconds * 1000).unref();
    return { scheduled: true, delaySeconds };
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
  // The SDK runs one action at a time. The editor asks for the outline
  // (documentSymbol) on its own while the user hovers or presses F12, and the
  // linter runs while typing, so the pure language action may overlap them
  // instead of answering busy.
  // The data provider actions are read-only as well: the project tree asks
  // for decorations while the linter or the outline may be running.
  concurrentActions: ['language.mcdemo', 'sessions.read', 'commit.draft', 'decorations.read'],
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
