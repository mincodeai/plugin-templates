// Settings page of the process showcase (contributes.settingsPages, host 0.3.0).
// The same view also opens as a tab (command "Open Settings Page", tray menu).
// Plain JavaScript and DOM, no build step: ./mincode/ is the framework-neutral
// MinCode plugin UI core, synchronized from the MinCode repository
// (tools/plugin-sdk/sync-plugin-ui.mjs); do not edit it.
import { createTransport } from './mincode/transport.js';

const messages = {
  zh: {
    title: '示例设置',
    where: { settings: '显示位置：设置 → 插件（surface = settings）', workspace: '显示位置：标签页（surface = workspace）' },
    connecting: '正在连接 MinCode…',
    counter: '计数器',
    demo: '演示模式',
    on: '开启',
    off: '关闭',
    refresh: '刷新',
    notify: '发送带按钮的通知',
    notifyLater: '5 秒后发送（切到其他应用看系统通知）',
    immersive: '沉浸全屏',
    sent: '已发送，打开通知中心查看两个按钮。',
    scheduled: '5 秒后发送。系统通知没有按钮，点击它会打开本页面。',
    tray: '系统托盘菜单里「Process Contributions Showcase」子菜单有「切换演示模式」和「打开设置页面」。',
    failed: '操作失败',
  },
  en: {
    title: 'Demo settings',
    where: { settings: 'Shown in: Settings → Plugins (surface = settings)', workspace: 'Shown in: a tab (surface = workspace)' },
    connecting: 'Connecting to MinCode…',
    counter: 'Counter',
    demo: 'Demo mode',
    on: 'On',
    off: 'Off',
    refresh: 'Refresh',
    notify: 'Send a notification with buttons',
    notifyLater: 'Send in 5 seconds (switch to another app for the system notification)',
    immersive: 'Immersive mode',
    sent: 'Sent. Open the notification center to see the two buttons.',
    scheduled: 'Sending in 5 seconds. The system notification has no buttons; clicking it opens this page.',
    tray: 'The system tray menu has a "Process Contributions Showcase" submenu with Toggle Demo Mode and Open Settings Page.',
    failed: 'Operation failed',
  },
};

const state = { locale: 'zh', surface: 'workspace', connected: false, busy: false, count: null, demo: null, notice: '', error: '' };

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const root = document.getElementById('app');
const title = element('h1', 'page__title');
const where = element('p', 'page__muted');
const values = element('dl', 'page__values');
const buttons = element('div', 'page__buttons');
const refreshButton = element('button', 'page__button');
const notifyButton = element('button', 'page__button page__button--primary');
const laterButton = element('button', 'page__button');
// Immersive mode works on a settings page like on any view; the host keeps its exit control.
const immersiveButton = element('button', 'page__button');
const pageButtons = [refreshButton, notifyButton, laterButton, immersiveButton];
for (const button of pageButtons) button.type = 'button';
buttons.append(...pageButtons);
const status = element('p', 'page__notice');
status.setAttribute('role', 'status');
const alert = element('p', 'page__alert');
alert.setAttribute('role', 'alert');
const tray = element('p', 'page__muted');
root.replaceChildren(title, where, values, buttons, status, alert, tray);

// Assigned below; onError may run while createTransport is still starting (page opened outside MinCode).
let transport = null;

// Everything goes through textContent: host and plugin data are never parsed as HTML.
function render() {
  const text = messages[state.locale];
  title.textContent = text.title;
  where.textContent = text.where[state.surface] ?? state.surface;
  const pairs = state.connected
    ? [[text.counter, state.count ?? '…'], [text.demo, state.demo === null ? '…' : state.demo ? text.on : text.off]]
    : [[text.connecting, '']];
  values.replaceChildren(...pairs.flatMap(([term, value]) => [element('dt', undefined, term), element('dd', undefined, String(value))]));
  refreshButton.textContent = text.refresh;
  notifyButton.textContent = text.notify;
  laterButton.textContent = text.notifyLater;
  immersiveButton.textContent = text.immersive;
  immersiveButton.hidden = !state.connected || !transport?.immersive.supported();
  for (const button of pageButtons) button.disabled = !state.connected || state.busy;
  status.textContent = state.notice;
  alert.hidden = !state.error;
  alert.textContent = state.error;
  tray.textContent = text.tray;
  root.setAttribute('aria-busy', String(!state.connected || state.busy));
}

transport = createTransport({
  onReady() {
    state.connected = true;
    state.error = '';
    void run(refresh);
  },
  onError(message) {
    state.connected = false;
    state.error = message;
    render();
  },
  // The host context carries theme, locale and surface ("settings" under
  // Settings → Plugins; older transports fall back to "workspace").
  applyContext(context) {
    document.documentElement.dataset.theme = context?.theme ?? 'light';
    state.locale = context?.locale?.startsWith('zh') === false ? 'en' : 'zh';
    state.surface = context?.surface ?? 'workspace';
    document.documentElement.lang = state.locale === 'zh' ? 'zh-CN' : 'en';
    render();
  },
});

async function refresh() {
  const result = await transport.call('settings.state', {});
  state.count = result?.count ?? null;
  state.demo = typeof result?.demo === 'boolean' ? result.demo : null;
}

async function run(task) {
  if (state.busy) return;
  state.busy = true;
  state.error = '';
  render();
  try {
    await task();
  } catch (cause) {
    state.error = cause instanceof Error && cause.message ? cause.message : messages[state.locale].failed;
  } finally {
    state.busy = false;
    render();
  }
}

refreshButton.addEventListener('click', () => {
  state.notice = '';
  void run(refresh);
});
notifyButton.addEventListener('click', () => void run(async () => {
  await transport.call('notify.demo', { delaySeconds: 0 });
  state.notice = messages[state.locale].sent;
}));
laterButton.addEventListener('click', () => void run(async () => {
  await transport.call('notify.demo', { delaySeconds: 5 });
  state.notice = messages[state.locale].scheduled;
}));
immersiveButton.addEventListener('click', () => void run(() => transport.immersive.enter()));
addEventListener('pagehide', () => transport.close());
render();
