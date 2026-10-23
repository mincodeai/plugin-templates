#!/usr/bin/env node
// Manual test plugin for MinCode's generic host UI requests, plugin calls,
// events and schedules. Every command calls one host method and reports the
// outcome through host.notify.
import { start } from '../lib/runtime.mjs';

// Prompts wait PROMPT_MS for the user; the host call itself must wait a
// little longer (SDK per-call timeout). Commands run inside a 30 s invoke,
// so prompts here stay below that.
const PROMPT_MS = 20_000;
const PROMPT_CALL = { timeoutMs: PROMPT_MS + 5_000 };
// A plugin call waits for the approval plus the called action (up to 30 s).
const INVOKE_CALL = { timeoutMs: PROMPT_MS + 30_000 + 5_000 };

const recent = [];
const remember = (event, data) => {
  recent.unshift(`${new Date().toLocaleTimeString()} ${event} ${JSON.stringify(data)}`);
  recent.length = Math.min(recent.length, 8);
};
const notify = (host, title, body = '', level = 'info') => host('host.notify', { title, body: String(body).slice(0, 480), level });

async function firstFile(host) {
  const listing = await host('host.workspace.list', { path: '' });
  const entries = Array.isArray(listing?.entries) ? listing.entries : Array.isArray(listing) ? listing : [];
  const file = entries.find(entry => entry.type === 'file' && /readme|package\.json|go\.mod|\.md$/i.test(entry.name)) ?? entries.find(entry => entry.type === 'file');
  if (!file) throw new Error('No file in the workspace root; open a project first');
  return file.name;
}

async function report(host, title, work) {
  try {
    const result = await work();
    await notify(host, `✓ ${title}`, typeof result === 'string' ? result : JSON.stringify(result ?? {}), 'success');
    return { ok: true, result };
  } catch (error) {
    await notify(host, `✗ ${title}`, error?.message ?? String(error), 'error').catch(() => {});
    return { ok: false, error: error?.message ?? String(error) };
  }
}

start(host => ({
  editor: () => report(host, 'host.editor.open', async () => {
    const path = await firstFile(host);
    await host('host.editor.open', { path, line: 3, column: 2 });
    return `requested ${path}:3:2`;
  }),
  diff: () => report(host, 'host.diff.open', () => host('host.diff.open', {
    title: 'config.yaml', language: 'yaml',
    left: { title: 'server', content: 'name: demo\nport: 8080\ntoken: ${TOKEN}\nfeatures:\n  - a\n  - b\n' },
    right: { title: 'local', content: 'name: demo\nport: 9090\ntoken: ${TOKEN}\nfeatures:\n  - a\n  - c\n  - d\n' },
  })),
  pick: () => report(host, 'host.quickPick', () => host('host.quickPick', {
    title: '选择环境 / Pick an environment', placeholder: '输入以筛选', timeoutMs: PROMPT_MS,
    items: [
      { id: 'dev', label: 'Development', description: 'dev.example.com' },
      { id: 'staging', label: 'Staging', description: 'staging.example.com', detail: 'Shared with QA' },
      { id: 'prod', label: 'Production', description: 'example.com', detail: 'Be careful' },
    ],
  }, PROMPT_CALL)),
  pickMany: () => report(host, 'host.quickPick (many)', () => host('host.quickPick', {
    title: '选择要同步的工具 / Pick tools', canPickMany: true, timeoutMs: PROMPT_MS,
    items: ['Claude Code', 'Codex', 'Cursor', 'VS Code', 'Gemini CLI'].map((label, index) => ({ id: `t${index}`, label })),
  }, PROMPT_CALL)),
  input: () => report(host, 'host.inputBox', () => host('host.inputBox', { title: '版本号 / Version tag', prompt: '输入要创建的 tag', placeholder: 'v1.2.3', value: 'v0.1.0', timeoutMs: PROMPT_MS }, PROMPT_CALL)),
  password: () => report(host, 'host.inputBox (password)', async () => {
    const result = await host('host.inputBox', { title: '令牌 / Token', password: true, placeholder: '不会显示在任何地方', timeoutMs: PROMPT_MS }, PROMPT_CALL);
    return { cancelled: result.cancelled, length: (result.value ?? '').length };
  }),
  terminal: () => report(host, 'host.terminal.open', () => host('host.terminal.open', { title: 'Host API Showcase', command: 'echo "hello from host-api-showcase" && pwd' })),
  view: () => report(host, 'host.view.open', async () => {
    const { plugins } = await host('host.plugins.list', {});
    if (!plugins.length) throw new Error('No other plugin with AI actions is installed');
    const choice = await host('host.quickPick', { title: '打开哪个插件的页面？（视图 main）', timeoutMs: PROMPT_MS, items: plugins.slice(0, 50).map((plugin, index) => ({ id: `p${index}`, label: plugin.name, description: plugin.id })) }, PROMPT_CALL);
    if (choice.cancelled) return 'cancelled';
    const target = plugins[Number(choice.ids[0].slice(1))];
    try {
      await host('host.view.open', { pluginId: target.id, viewId: 'main' });
    } catch (error) {
      throw new Error(`${target.id} 没有名为 main 的视图，或未在当前工作区生效：${error?.message ?? error}`);
    }
    return `requested ${target.id}/main`;
  }),
  invoke: () => report(host, 'host.plugins.invoke', async () => {
    const { plugins } = await host('host.plugins.list', {});
    const pairs = plugins.flatMap(plugin => plugin.actions.map(action => ({ pluginId: plugin.id, action, label: `${plugin.name} · ${action}`, granted: plugin.granted }))).slice(0, 200);
    if (!pairs.length) throw new Error('No other plugin with AI actions is installed');
    const choice = await host('host.quickPick', { title: '调用哪个动作？（参数为 {}）', timeoutMs: PROMPT_MS, items: pairs.map((pair, index) => ({ id: `a${index}`, label: pair.label, description: pair.granted ? 'granted' : '' })) }, PROMPT_CALL);
    if (choice.cancelled) return 'cancelled';
    const { pluginId, action } = pairs[Number(choice.ids[0].slice(1))];
    const { result } = await host('host.plugins.invoke', { pluginId, action, payload: {}, timeoutMs: PROMPT_MS }, INVOKE_CALL);
    return JSON.stringify(result).slice(0, 400);
  }),
  events: async () => {
    await notify(host, `最近事件（${recent.length}）`, recent.join('\n') || '还没有收到事件：切换文件、移动光标或切换 git 分支试试');
    return { recent };
  },
  tick: async payload => {
    await notify(host, '定时任务执行了', `schedule=${payload?.schedule} firedAt=${payload?.firedAt}`, 'success');
    return {};
  },
}), {
  hostTimeoutMs: 10_000,
  allowNullPayload: true,
  events: ['workspace.rootChanged', 'editor.activeFileChanged', 'editor.fileSaved', 'editor.selectionChanged', 'git.headChanged'],
  onEvent: (event, data) => remember(event, data),
  formatResult: result => ({ result }),
});
