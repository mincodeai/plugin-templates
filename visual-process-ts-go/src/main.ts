// A framework-neutral plugin page: plain TypeScript and DOM APIs, no UI
// library. Swap this file for React, Svelte, Solid or anything that builds
// to static assets; keep talking to MinCode only through ./transport.
import "./mincode/theme.css";
import "./styles.css";
import { createTransport, type HostContext } from "./transport";

interface GreetingResult {
  message: string;
  receivedAt: string;
  runtime: string;
}

const messages = {
  zh: {
    title: "TypeScript + Go 插件模板",
    subtitle: "不依赖 UI 框架的页面，通过受控桥调用独立 Go 进程。",
    connected: "已连接宿主",
    waiting: "等待宿主连接",
    label: "称呼",
    placeholder: "请输入称呼",
    run: "调用 Go 后端",
    running: "调用中…",
    empty: "执行操作后，Go 后端返回的结果会显示在这里。",
    runtime: "运行时",
    time: "响应时间",
    message: "消息",
    failed: "操作失败",
  },
  en: {
    title: "TypeScript + Go Plugin Template",
    subtitle: "A page without a UI framework calls an isolated Go process through the controlled bridge.",
    connected: "Host connected",
    waiting: "Waiting for host",
    label: "Name",
    placeholder: "Enter a name",
    run: "Call Go backend",
    running: "Calling…",
    empty: "Run the action to display the Go backend response.",
    runtime: "Runtime",
    time: "Received",
    message: "Message",
    failed: "Operation failed",
  },
};
type Copy = typeof messages.zh;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const state = {
  locale: "zh" as keyof typeof messages,
  connected: false,
  busy: false,
  error: "",
  result: null as GreetingResult | null,
};

const root = document.getElementById("app")!;
const page = element("main", "plugin-page");
const heading = element("header", "plugin-heading");
const titles = element("div");
const title = element("h1");
const subtitle = element("p");
const status = element("span", "plugin-status");
status.setAttribute("role", "status");
titles.append(title, subtitle);
heading.append(titles, status);

const alert = element("p", "plugin-alert");
alert.setAttribute("role", "alert");

// A div, not <form>: the sandboxed iframe has no allow-forms, so the browser
// drops form submission before any submit event. Use click and Enter instead.
const form = element("div", "plugin-card plugin-form");
const label = element("label", "plugin-label");
label.htmlFor = "plugin-name";
const input = element("input", "plugin-input");
input.id = "plugin-name";
input.maxLength = 80;
input.value = "MinCode";
const button = element("button", "plugin-button");
button.type = "button";
form.append(label, input, button);

const result = element("section", "plugin-card plugin-result");
result.setAttribute("aria-live", "polite");
page.append(heading, alert, form, result);
root.replaceChildren(page);

function copy(): Copy {
  return messages[state.locale];
}

// All values go through textContent; host and plugin data are never parsed as HTML.
function render() {
  const text = copy();
  title.textContent = text.title;
  subtitle.textContent = text.subtitle;
  status.textContent = state.connected ? text.connected : text.waiting;
  status.dataset.state = state.connected ? "connected" : "waiting";
  alert.hidden = !state.error;
  alert.textContent = state.error;
  label.textContent = text.label;
  input.placeholder = text.placeholder;
  button.textContent = state.busy ? text.running : text.run;
  button.disabled = !state.connected || state.busy || !input.value.trim();
  form.setAttribute("aria-busy", String(state.busy));
  if (!state.result) {
    result.replaceChildren(element("p", "plugin-empty", text.empty));
    return;
  }
  const list = element("dl", "plugin-details");
  for (const [term, value] of [[text.runtime, state.result.runtime], [text.time, state.result.receivedAt], [text.message, state.result.message]]) {
    list.append(element("dt", undefined, term), element("dd", undefined, value));
  }
  result.replaceChildren(list);
}

function applyContext(context: HostContext) {
  document.documentElement.dataset.theme = context.theme ?? "light";
  state.locale = context.locale?.startsWith("zh") === false ? "en" : "zh";
  document.documentElement.lang = state.locale === "zh" ? "zh-CN" : "en";
  render();
}

const transport = createTransport({
  onReady() {
    state.connected = true;
    state.error = "";
    render();
  },
  onError(message) {
    state.connected = false;
    state.error = message;
    render();
  },
  applyContext,
});

async function greet() {
  if (!state.connected || state.busy || !input.value.trim()) return;
  state.busy = true;
  state.error = "";
  state.result = null;
  render();
  try {
    state.result = await transport.call<GreetingResult>("greeting.create", { name: input.value });
  } catch (cause) {
    state.error = cause instanceof Error ? cause.message : copy().failed;
  } finally {
    state.busy = false;
    render();
  }
}

input.addEventListener("input", render);
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.isComposing) void greet();
});
button.addEventListener("click", () => void greet());
addEventListener("pagehide", () => transport.close());
render();
