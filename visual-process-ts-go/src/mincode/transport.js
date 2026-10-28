/* global URLSearchParams, location, parent, setTimeout, clearTimeout, addEventListener, removeEventListener, TextEncoder, TextDecoder, btoa, atob, WebSocket */
import { applyThemeTokens } from './theme-tokens.js';

export function createTransport({ onReady, onError, applyContext, onFilesDropped, onPathsDropped, onConfigurationChanged, onDocumentChanged, onFloatingChanged, onSave }) {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const session = { sessionId: fragment.get('mincodeSession') ?? '', nonce: fragment.get('nonce') ?? '', generation: Number(fragment.get('generation')) };
  const requestTimeoutGraceMs = 5000, legacyRequestTimeoutMs = 40000, aiConfigApplyTimeoutMs = 10 * 60000;
  let port, sequence = 0, requestTimeoutMs = legacyRequestTimeoutMs, callsSupported = false, messagesSupported = false, binarySupported = false, tasksSupported = false, taskEventsSupported = false, clipboardWriteSupported = false, trustedConfirmSupported = false, aiConfigSupported = false, configurationSupported = false, documentSupported = false, documentInfo = null, documentSaveHandler = null, openRequestSupported = false, openRequestHandler = null, openRequestSubscribed = false, floatingSupported = false, floatingClickHandler = null, floatingClickToken = '', visibilitySupported = false, pageVisible = true, connected = false, prefetchSupported = false, prefetchAction = '', prefetchOutcome = null, prefetchConsumed = false, closed = false, locale = 'zh';
  const pending = new Map();
  const binaryListeners = new Set();
  const messageListeners = new Set();
  const maxMessageBytes = 256 * 1024;
  const taskListeners = new Set();
  const visibilityListeners = new Set();
  // features.immersive / keyboardCapture: the host tells the page when it ends either.
  const immersiveListeners = new Set();
  const keyboardListeners = new Set();
  let immersiveSupported = false, keyboardSupported = false, immersiveActive = false, keyboardCaptured = false;
  // prefetched(action) callers waiting for the connect message or the host's prefetch push.
  const prefetchWaiters = new Set();
  // Busy retries waiting for their next attempt; close() rejects them at once.
  const retryWaits = new Set();
  const maxBinaryBytes = 8 * 1024 * 1024;
  const directOpenState = 1, directRetryStartMs = 500, directRetryMaxMs = 8000;
  let directSupported = false, directSocket = null, directConnecting = false, directRetryTimer, directRetryMs = directRetryStartMs;
  const channelPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
  const methodPattern = /^[A-Za-z][A-Za-z0-9_]*(?:[./:-][A-Za-z0-9_]+)*$/;
  const message = (zh, en) => locale === 'zh' ? zh : en;
  const viewIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  // Where the host embeds this page: a workspace tab, a custom-editor document, a dashboard widget card or a floating window.
  const surfaces = ['workspace', 'document', 'widget', 'floating'];
  let surface = 'workspace';
  function context(value) {
    locale = value?.locale ?? locale;
    if (surfaces.includes(value?.surface)) surface = value.surface;
    applyContext(value && typeof value === 'object' ? { ...value, surface } : value);
    applyThemeTokens(value?.themeTokens);
  }
  // AI settings items are JSON by contract. Pages usually hold them in Vue reactive
  // state, and the proxies cannot be structured-cloned by postMessage.
  const jsonCopy = value => JSON.parse(JSON.stringify(value));

  function request(body, timeoutMs = requestTimeoutMs, transfer) {
    if (closed || !port) return Promise.reject(new Error(message('宿主未连接', 'Host is not connected')));
    if (pending.size >= 8) return Promise.reject(new Error(message('请求过多，请稍后重试', 'Too many requests; try again later')));
    const id = `request-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error(message('请求超时；操作可能仍在运行，请勿重复执行', 'Request timed out; the operation may still be running. Do not retry blindly.')), { uncertain: true })); }, timeoutMs + requestTimeoutGraceMs);
      pending.set(id, { resolve, reject, timer });
      try { port.postMessage({ ...body, id }, transfer ?? []); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  // 插件进程的串行门闩（未声明并发的动作一次一个）：busy 冲突按退避重试直至门闩释放。
  // 首次重试 50ms：短动作通常几十毫秒内就释放门闩；总等待约 16s，与旧的 [500…8000] 接近。
  const busyRetryDelaysMs = [50, 100, 250, 500, 1000, 2000, 4000, 8000];
  function waitRetry(delay) {
    return new Promise((resolve, reject) => {
      const entry = { reject, timer: setTimeout(() => { retryWaits.delete(entry); resolve(); }, delay) };
      retryWaits.add(entry);
    });
  }
  function call(action, payload, kind, options) {
    if (kind) return request({
      type: 'mincode.plugin.pick-path', kind,
      ...(options?.multiple === true ? { multiple: true } : {}),
      ...(Array.isArray(options?.extensions) ? { extensions: options.extensions } : {}),
    });
    let attempt = 0;
    const send = () => request({ type: 'mincode.plugin.invoke', action, payload });
    const retry = cause => {
      if (cause?.code !== 'busy' || attempt >= busyRetryDelaysMs.length || closed) throw cause;
      const delay = busyRetryDelaysMs[attempt];
      attempt += 1;
      return waitRetry(delay).then(send).catch(retry);
    };
    return send().catch(retry);
  }
  // plugin.call: methods the plugin process registered for its views (no risk confirmation, never AI).
  function callMethod(method, params) {
    if (!callsSupported) return Promise.reject(Object.assign(new Error(message('宿主不支持插件方法调用', 'Host does not support plugin method calls')), { code: 'not-allowed' }));
    if (typeof method !== 'string' || method.length > 128 || !methodPattern.test(method) || /^(plugin|host|rpc)\./i.test(method)) return Promise.reject(Object.assign(new Error(message('方法名无效', 'Invalid method name')), { code: 'invalid-request' }));
    return request({ type: 'mincode.plugin.call', method, params: params === undefined ? null : params });
  }
  // features.messages: free-form JSON to this plugin's process (plugin.ui.message), like VS Code's webview postMessage.
  // Messages go out one at a time in posting order, so a burst never hits the eight-request bound (at most
  // maxQueuedMessages wait here); a busy process queue is retried like call(). The promise settles once the
  // process accepted the message. No risk confirmation, never AI.
  let messageChain = Promise.resolve(), queuedMessages = 0;
  const maxQueuedMessages = 1024;
  function postMessage(value) {
    if (!messagesSupported) return Promise.reject(Object.assign(new Error(message('宿主不支持插件消息', 'Host does not support plugin messages')), { code: 'not-allowed' }));
    let json;
    try { json = JSON.stringify(value); } catch { json = undefined; }
    if (json === undefined || json === 'null') return Promise.reject(Object.assign(new Error(message('消息必须是可序列化为 JSON 的非空值', 'The message must be a non-null JSON-serializable value')), { code: 'invalid-request' }));
    if (new TextEncoder().encode(json).byteLength > maxMessageBytes - 1024) return Promise.reject(Object.assign(new Error(message('消息超过 256 KiB', 'The message exceeds 256 KiB')), { code: 'payload-too-large' }));
    if (queuedMessages >= maxQueuedMessages) return Promise.reject(Object.assign(new Error(message('待发送消息过多，请稍后重试', 'Too many queued messages; try again later')), { code: 'busy' }));
    const body = { type: 'mincode.plugin.message', message: JSON.parse(json) };
    let attempt = 0;
    const send = () => request(body);
    const retry = cause => {
      if (cause?.code !== 'busy' || attempt >= busyRetryDelaysMs.length || closed) throw cause;
      const delay = busyRetryDelaysMs[attempt];
      attempt += 1;
      return waitRetry(delay).then(send).catch(retry);
    };
    queuedMessages += 1;
    const delivery = messageChain.then(() => send().catch(retry));
    messageChain = delivery.catch(() => undefined);
    return delivery.then(() => undefined).finally(() => { queuedMessages -= 1; });
  }
  function sendBinary(channel, data) {
    if (!binarySupported) return Promise.reject(Object.assign(new Error(message('插件未启用二进制通道', 'This plugin does not use the binary channel')), { code: 'not-allowed' }));
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data instanceof Uint8Array ? data : null;
    if (typeof channel !== 'string' || !channelPattern.test(channel) || !bytes) return Promise.reject(Object.assign(new Error(message('二进制请求无效', 'Invalid binary request')), { code: 'invalid-request' }));
    if (bytes.byteLength > maxBinaryBytes) return Promise.reject(Object.assign(new Error(message('二进制数据超过 8 MiB，请分块发送', 'Binary data exceeds 8 MiB; send it in chunks')), { code: 'payload-too-large' }));
    // The direct socket is a faster path to the same process; the bridge stays the fallback.
    if (directSocket && directSocket.readyState === directOpenState) {
      try {
        directSocket.send(encodeDirectFrame(channel, bytes));
        return Promise.resolve(true);
      } catch { /* fall back to the bridge below */ }
    }
    // Copy before transferring so the caller's buffer stays usable.
    const buffer = bytes.slice().buffer;
    return request({ type: 'mincode.plugin.binary', channel, data: buffer }, requestTimeoutMs, [buffer]);
  }
  // features.binaryDirect: a WebSocket to the host's asset server carries binary frames without
  // base64 or event broadcasts. Frames are [channel length][channel][payload] both ways.
  function encodeDirectFrame(channel, bytes) {
    // Channel names are ASCII (channelPattern), so each character is one byte.
    const name = Uint8Array.from(channel, (char) => char.charCodeAt(0));
    const frame = new Uint8Array(1 + name.byteLength + bytes.byteLength);
    frame[0] = name.byteLength;
    frame.set(name, 1);
    frame.set(bytes, 1 + name.byteLength);
    return frame;
  }
  function deliverDirectFrame(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 2) return;
    const frame = new Uint8Array(buffer);
    const length = frame[0];
    if (length === 0 || frame.byteLength < 1 + length) return;
    const channel = String.fromCharCode(...frame.subarray(1, 1 + length));
    if (!channelPattern.test(channel)) return;
    const data = frame.subarray(1 + length);
    for (const listener of [...binaryListeners]) { try { listener(channel, data); } catch (cause) { onError(String(cause?.message ?? cause)); } }
  }
  function openDirect() {
    if (!directSupported || closed || directSocket || directConnecting || typeof WebSocket !== 'function') return;
    directConnecting = true;
    request({ type: 'mincode.plugin.direct.token' }).then((result) => {
      directConnecting = false;
      if (closed || typeof result?.url !== 'string' || !/^ws:\/\/127\.0\.0\.1:\d+\/__mincode\/direct\?token=[0-9a-f]{64}$/.test(result.url)) return;
      const socket = new WebSocket(result.url);
      socket.binaryType = 'arraybuffer';
      directSocket = socket;
      socket.onopen = () => { if (directSocket === socket) directRetryMs = directRetryStartMs; };
      socket.onmessage = (event) => { if (directSocket === socket) deliverDirectFrame(event.data); };
      socket.onerror = () => {};
      socket.onclose = () => {
        if (directSocket !== socket) return;
        directSocket = null;
        scheduleDirectRetry();
      };
    }, () => {
      directConnecting = false;
      scheduleDirectRetry();
    });
  }
  function scheduleDirectRetry() {
    if (closed || directRetryTimer) return;
    const delay = directRetryMs;
    directRetryMs = Math.min(directRetryMs * 2, directRetryMaxMs);
    directRetryTimer = setTimeout(() => { directRetryTimer = undefined; openDirect(); }, delay);
  }
  function closeDirect() {
    if (directRetryTimer) { clearTimeout(directRetryTimer); directRetryTimer = undefined; }
    const socket = directSocket;
    directSocket = null;
    if (socket) { socket.onclose = null; socket.onmessage = null; try { socket.close(); } catch { /* already closed */ } }
  }
  function takeover(supported, type) {
    if (!supported) return Promise.reject(Object.assign(new Error(message('宿主不支持该功能，请升级 MinCode', 'This MinCode version does not support it; update MinCode')), { code: 'not-allowed' }));
    return request({ type });
  }
  function subscribe(listeners, fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }
  function task(operation, args) {
    if (!tasksSupported) return Promise.reject(new Error(message('宿主不支持任务协议', 'Host does not support the task protocol')));
    return request({ ...args, type: `mincode.plugin.task.${operation}` });
  }
  function connect(event) {
    const message = event.data;
    if (closed || event.source !== parent || message?.type !== 'mincode.host.connect' || message.protocolVersion !== 1 || message.sessionId !== session.sessionId || message.nonce !== session.nonce || message.generation !== session.generation || (message.requestTimeoutMs !== undefined && (!Number.isSafeInteger(message.requestTimeoutMs) || message.requestTimeoutMs < 1000 || message.requestTimeoutMs > 300000)) || event.ports.length !== 1) return;
    removeEventListener('message', connect); requestTimeoutMs = message.requestTimeoutMs ?? legacyRequestTimeoutMs; port = event.ports[0];
    callsSupported = message.features?.calls === 1;
    messagesSupported = message.features?.messages === 1;
    binarySupported = message.features?.binary === 1;
    directSupported = binarySupported && message.features?.binaryDirect === 1;
    immersiveSupported = message.features?.immersive === 1;
    keyboardSupported = message.features?.keyboardCapture === 1;
    tasksSupported = message.features?.tasks === 1;
    taskEventsSupported = tasksSupported && message.features?.taskEvents === 1;
    clipboardWriteSupported = message.features?.clipboardWrite === 1;
    trustedConfirmSupported = message.features?.trustedConfirm === 1;
    // features.aiConfig: only for plugins that declared the ai.config capability.
    aiConfigSupported = message.features?.aiConfig === 1;
    configurationSupported = message.features?.configuration === 1;
    documentSupported = message.features?.document === 1 && validDocument(message.document);
    documentInfo = documentSupported ? message.document : null;
    openRequestSupported = message.features?.openRequest === 1;
    floatingSupported = message.features?.floating === 1;
    // features.visibility: the host says when this page is hidden (inactive tab, closed tab kept warm).
    visibilitySupported = message.features?.visibility === 1;
    if (visibilitySupported && typeof message.visible === 'boolean') pageVisible = message.visible;
    // features.prefetch: the host already invoked the view's declared read-only action and pushes its outcome once.
    prefetchSupported = message.features?.prefetch === 1;
    prefetchAction = prefetchSupported && typeof message.prefetch?.action === 'string' ? message.prefetch.action : '';
    port.onmessage = event => {
      const data = event.data;
      if (data?.type === 'mincode.host.view.save-request' && typeof data.requestId === 'string' && onSave) {
        const requestId = data.requestId;
        Promise.resolve().then(() => onSave()).then(
          () => { if (!closed && port) port.postMessage({ type: 'mincode.plugin.view.save-result', requestId, ok: true }); },
          () => { if (!closed && port) port.postMessage({ type: 'mincode.plugin.view.save-result', requestId, ok: false }); },
        );
        return;
      }
      if (data?.type === 'mincode.host.context') { context(data.context); return; }
      if (data?.type === 'mincode.host.prefetch') { if (prefetchAction && data.action === prefetchAction && !prefetchOutcome && !prefetchConsumed) { prefetchOutcome = data.ok === true ? { ok: true, result: data.result } : { ok: false }; settlePrefetchWaiters(); } return; }
      if (data?.type === 'mincode.host.visibility') { if (visibilitySupported && typeof data.visible === 'boolean' && data.visible !== pageVisible) { pageVisible = data.visible; for (const listener of [...visibilityListeners]) { try { listener(pageVisible); } catch (cause) { onError(String(cause?.message ?? cause)); } } } return; }
      // features.taskEvents: the host pushes snapshots of tasks this page started as soon as they change.
      if (data?.type === 'mincode.host.task.changed') { if (taskEventsSupported && typeof data.taskId === 'string' && data.snapshot && typeof data.snapshot === 'object' && data.snapshot.taskId === data.taskId) for (const listener of [...taskListeners]) { try { listener({ ...data.snapshot }); } catch (cause) { onError(String(cause?.message ?? cause)); } } return; }
      // Messages the plugin process posted with host.ui.postMessage, in the order it sent them.
      if (data?.type === 'mincode.host.message') { if (messagesSupported && data.message !== undefined && data.message !== null) for (const listener of [...messageListeners]) { try { listener(data.message); } catch (cause) { onError(String(cause?.message ?? cause)); } } return; }
      // Binary frames the plugin process sent with sendBinary (runtime.transport "framed").
      if (data?.type === 'mincode.host.immersive') { if (typeof data.active === 'boolean') { immersiveActive = data.active; for (const listener of [...immersiveListeners]) { try { listener(data.active); } catch (cause) { onError(String(cause?.message ?? cause)); } } } return; }
      if (data?.type === 'mincode.host.keyboard') { if (data.captured === false) { keyboardCaptured = false; for (const listener of [...keyboardListeners]) { try { listener(); } catch (cause) { onError(String(cause?.message ?? cause)); } } } return; }
      if (data?.type === 'mincode.host.binary') { if (typeof data.channel === 'string' && data.data instanceof ArrayBuffer) for (const listener of [...binaryListeners]) { try { listener(data.channel, new Uint8Array(data.data)); } catch (cause) { onError(String(cause?.message ?? cause)); } } return; }
      // Host-read desktop drops for pages that opt in (bounded and validated by the host; the page re-validates).
      // Plugin settings changed (contributes.configuration): non-secret values only.
      if (data?.type === 'mincode.host.configuration') { if (onConfigurationChanged && Array.isArray(data.keys) && data.values && typeof data.values === 'object') onConfigurationChanged({ keys: data.keys, values: data.values }); return; }
      // contributes.customEditors: the bound document changed (host reload) or the host asks the page to save.
      if ((data?.type === 'mincode.host.document' || data?.type === 'mincode.host.document.changed') && documentSupported) { if (validDocument(data.document)) { documentInfo = data.document; if (onDocumentChanged) onDocumentChanged({ ...documentInfo }); } return; }
      if (data?.type === 'mincode.host.document.save-request' && documentSupported && typeof data.requestId === 'string') { runSaveRequest(data.requestId); return; }
      // uriHandlers / searchProviders: the host asks this page to show something (only after onOpenRequest).
      if (data?.type === 'mincode.host.open-request') { if (openRequestHandler && data.request && typeof data.request === 'object' && typeof data.request.entry === 'string') openRequestHandler({ ...data.request }); return; }
      // views[].floating: the user clicked (not dragged) this floating window; the token allows one activate().
      if (data?.type === 'mincode.host.floating.click') { if (typeof data.token === 'string') { floatingClickToken = data.token; if (floatingClickHandler) { try { floatingClickHandler(Number.isFinite(data.x) && Number.isFinite(data.y) ? { x: data.x, y: data.y } : undefined); } catch (cause) { onError(String(cause?.message ?? cause)); } } } return; }
      // views[].floating: one of this plugin's floating views opened or closed.
      if (data?.type === 'mincode.host.floating') { if (onFloatingChanged && typeof data.viewId === 'string' && typeof data.visible === 'boolean') onFloatingChanged({ viewId: data.viewId, visible: data.visible }); return; }
      if (data?.type === 'mincode.host.files-dropped') { if (onFilesDropped && Array.isArray(data.files)) onFilesDropped(data.files); return; }
      // views[].fileDrop mode "paths": absolute paths of what the user dropped, pre-filtered by the manifest.
      if (data?.type === 'mincode.host.paths-dropped') { if (onPathsDropped && Array.isArray(data.entries)) onPathsDropped(data.entries.map(entry => ({ ...entry }))); return; }
      if (data?.type === 'mincode.host.probe' && typeof data.id === 'string') {
        port.postMessage({ type: 'mincode.plugin.probe', id: data.id });
        return;
      }
      if (data?.type !== 'mincode.host.response') return;
      const entry = pending.get(data.id); if (!entry) return;
      pending.delete(data.id); clearTimeout(entry.timer);
      if (data.ok === true) entry.resolve(data.result);
      else {
        const error = Object.assign(new Error(data.error?.message ?? messageText()), {
          code: data.error?.code ?? 'invoke-failed',
          retryable: data.error?.retryable === true,
          cancelled: data.error?.code === 'cancelled',
          details: data.error?.details,
        });
        entry.reject(error);
      }
    };
    port.onmessageerror = close;
    port.start(); connected = true; settlePrefetchWaiters(); context(message.context); if (message.features?.viewSave === 1 && onSave) port.postMessage({ type: 'mincode.plugin.view.save-subscribe' }); onReady(); subscribeOpenRequests(); openDirect();
  }
  // Tells the host this page handles open requests; the host queues them until then.
  function subscribeOpenRequests() {
    if (!openRequestSupported || !openRequestHandler || openRequestSubscribed || closed || !port) return;
    openRequestSubscribed = true;
    try { port.postMessage({ type: 'mincode.plugin.open-request.subscribe' }); } catch { openRequestSubscribed = false; }
  }
  function messageText() { return message('操作失败', 'Operation failed'); }
  // Resolves waiters that can be answered now: undefined when the host has no prefetch for that action
  // (or it was already consumed, failed, or the page closed), the result exactly once otherwise.
  function settlePrefetchWaiters() {
    for (const waiter of [...prefetchWaiters]) {
      let value;
      if (!closed) {
        if (!connected) continue;
        if (prefetchSupported && prefetchAction && waiter.action === prefetchAction && !prefetchConsumed) {
          if (!prefetchOutcome) continue;
          prefetchConsumed = true;
          value = prefetchOutcome.ok ? prefetchOutcome.result : undefined;
          prefetchOutcome = null;
        }
      }
      prefetchWaiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(value);
    }
  }
  function prefetched(action) {
    return new Promise(resolve => {
      if (typeof action !== 'string' || !action || closed || !session.sessionId || !session.nonce || !Number.isSafeInteger(session.generation) || session.generation < 1) { resolve(undefined); return; }
      // A host that announced a prefetch always pushes its outcome; the timeout only guards against a lost page.
      const waiter = { action, resolve, timer: setTimeout(() => { prefetchWaiters.delete(waiter); resolve(undefined); }, requestTimeoutMs + requestTimeoutGraceMs) };
      prefetchWaiters.add(waiter);
      settlePrefetchWaiters();
    });
  }
  function floatingRequest(body) {
    if (!floatingSupported) return Promise.reject(Object.assign(new Error(message('宿主不支持悬浮视图', 'Host does not support floating views')), { code: 'not-allowed' }));
    return request(body);
  }
  function floatingView(type, viewId) {
    if (typeof viewId !== 'string' || !viewIdPattern.test(viewId)) return Promise.reject(Object.assign(new Error(message('视图 ID 无效', 'Invalid view ID')), { code: 'invalid-request' }));
    return floatingRequest({ type, viewId }).then(result => result?.visible === true);
  }
  function validDocument(value) {
    return !!value && typeof value === 'object' && typeof value.name === 'string' && typeof value.relativePath === 'string' && Number.isSafeInteger(value.size) && value.size >= 0 && (value.access === 'read' || value.access === 'readWrite') && Number.isSafeInteger(value.chunkBytes) && value.chunkBytes > 0 && Number.isSafeInteger(value.maxReadBytes) && Number.isSafeInteger(value.maxWriteBytes);
  }
  function documentError(zh, en, code) { return Object.assign(new Error(message(zh, en)), { code }); }
  function requireDocument() {
    if (!documentSupported || !documentInfo) throw documentError('当前页面未绑定文档', 'No document is bound to this page', 'not-allowed');
    return documentInfo;
  }
  function toBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  }
  function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  async function readAll({ maxBytes } = {}) {
    const info = requireDocument();
    const limit = Math.min(Number.isSafeInteger(maxBytes) && maxBytes > 0 ? maxBytes : info.maxReadBytes, info.maxReadBytes);
    if (info.size > limit) throw documentError('文件过大，无法打开', 'The file is too large to open', 'payload-too-large');
    const parts = []; let offset = 0;
    for (;;) {
      const chunk = await request({ type: 'mincode.plugin.document.read', offset, length: info.chunkBytes });
      const bytes = fromBase64(typeof chunk?.data === 'string' ? chunk.data : '');
      offset += bytes.length;
      if (offset > limit) throw documentError('文件过大，无法打开', 'The file is too large to open', 'payload-too-large');
      parts.push(bytes);
      if (chunk?.eof === true || bytes.length === 0) break;
    }
    const result = new Uint8Array(offset); let position = 0;
    for (const part of parts) { result.set(part, position); position += part.length; }
    return result;
  }
  async function saveDocument(content) {
    const info = requireDocument();
    if (info.access !== 'readWrite') throw documentError('此编辑器为只读', 'This editor is read-only', 'not-allowed');
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content instanceof Uint8Array ? content : null;
    if (!bytes) throw documentError('保存内容必须是字符串或 Uint8Array', 'Save content must be a string or Uint8Array', 'invalid-request');
    if (bytes.length > info.maxWriteBytes) throw documentError('文件过大，无法保存', 'The file is too large to save', 'payload-too-large');
    let uploadId; let offset = 0;
    do {
      const next = Math.min(offset + info.chunkBytes, bytes.length);
      const last = next >= bytes.length;
      // The final chunk may wait on a host conflict dialog: allow the user time to answer.
      const result = await request({ type: 'mincode.plugin.document.save', ...(uploadId ? { uploadId } : {}), data: toBase64(bytes.subarray(offset, next)), last }, last ? 600000 : requestTimeoutMs);
      if (!last) { uploadId = result?.uploadId; if (typeof uploadId !== 'string') throw documentError('宿主上传响应无效', 'Invalid host upload response', 'invoke-failed'); }
      offset = next;
      if (last) return result ?? { saved: true };
    } while (offset <= bytes.length);
    return { saved: true };
  }
  async function runSaveRequest(requestId) {
    let ok = false, error;
    try {
      if (!documentSaveHandler) throw new Error(message('插件页面未处理保存请求', 'The plugin page does not handle save requests'));
      await documentSaveHandler();
      ok = true;
    } catch (cause) { error = String(cause?.message ?? cause ?? '').slice(0, 500); }
    if (!closed && port) port.postMessage({ type: 'mincode.plugin.document.save-result', requestId, ok, ...(error ? { error } : {}) });
  }
  function close() {
    closed = true;
    closeDirect();
    removeEventListener('message', connect);
    removeEventListener('pagehide', close);
    if (port) { port.onmessage = null; port.onmessageerror = null; port.close(); port = undefined; }
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Object.assign(new Error(message('插件页面已关闭', 'Plugin page closed')), { uncertain: true })); }
    pending.clear();
    // A busy call waiting to retry never ran: reject it without the uncertain flag.
    for (const entry of retryWaits) { clearTimeout(entry.timer); entry.reject(Object.assign(new Error(message('插件页面已关闭', 'Plugin page closed')), { code: 'busy' })); }
    retryWaits.clear();
    binaryListeners.clear();
    immersiveListeners.clear();
    keyboardListeners.clear();
    messageListeners.clear();
    taskListeners.clear();
    visibilityListeners.clear();
    settlePrefetchWaiters();
  }
  if (session.sessionId && session.nonce && Number.isSafeInteger(session.generation) && session.generation > 0) {
    addEventListener('message', connect);
    parent.postMessage({ type: 'mincode.plugin.ready', protocolVersion: 1, ...session }, '*');
  } else onError(message('请从 MinCode 桌面插件管理安装并打开', 'Install and open this plugin from MinCode desktop Plugin Manager'));
  addEventListener('pagehide', close);
  return {
    call, pickPath(kind, options) { return call('', null, kind, options); }, close,
    request: callMethod,
    messagesSupported() { return messagesSupported; },
    postMessage,
    onMessage(fn) {
      if (typeof fn !== 'function') return () => {};
      messageListeners.add(fn);
      return () => { messageListeners.delete(fn); };
    },
    binary: {
      supported() { return binarySupported; },
      // "direct" while the fast socket is open; "bridge" otherwise (the host relays frames).
      mode() { return directSocket && directSocket.readyState === directOpenState ? 'direct' : 'bridge'; },
      send: sendBinary,
      onMessage(fn) {
        if (typeof fn !== 'function') return () => {};
        binaryListeners.add(fn);
        return () => { binaryListeners.delete(fn); };
      },
    },
    // Hide the MinCode chrome and make the window fullscreen while this page shows. The host keeps its
    // own exit control and ends it when the page is hidden or closed; onChanged reports every change.
    immersive: {
      supported() { return immersiveSupported; },
      active() { return immersiveActive; },
      enter() { return takeover(immersiveSupported, 'mincode.plugin.immersive.enter'); },
      exit() { return takeover(immersiveSupported, 'mincode.plugin.immersive.exit'); },
      onChanged(fn) { return subscribe(immersiveListeners, fn); },
    },
    // Pause MinCode shortcuts so key combinations reach this page. The host releases it on Ctrl+Alt+Enter,
    // when the window or page loses focus, or when the page closes; onReleased reports that.
    keyboard: {
      supported() { return keyboardSupported; },
      captured() { return keyboardCaptured; },
      capture() { return takeover(keyboardSupported, 'mincode.plugin.keyboard.capture').then((result) => { keyboardCaptured = result === true; return result; }); },
      release() { return takeover(keyboardSupported, 'mincode.plugin.keyboard.release').then((result) => { keyboardCaptured = false; return result; }); },
      onReleased(fn) { return subscribe(keyboardListeners, fn); },
    },
    surface() { return surface; },
    // views[].prefetch: the first-screen result the host fetched while the page loaded, once; undefined means call the action yourself.
    prefetched,
    // features.visibility: false while the host hides this page; pause timers and polling until it is shown again.
    visible() { return pageVisible; },
    onVisibilityChange(fn) {
      if (typeof fn !== 'function') return () => {};
      visibilityListeners.add(fn);
      return () => { visibilityListeners.delete(fn); };
    },
    // views[].floating: show this plugin's floating views in their own always-on-top window.
    floating: {
      supported() { return floatingSupported; },
      show(viewId) { return floatingView('mincode.plugin.floating.show', viewId); },
      hide(viewId) { return floatingView('mincode.plugin.floating.hide', viewId); },
      visible(viewId) { return floatingView('mincode.plugin.floating.status', viewId); },
      onClick(fn) { floatingClickHandler = typeof fn === 'function' ? fn : null; },
      activate(target) {
        if (surface !== 'floating' || !floatingClickToken) return Promise.reject(Object.assign(new Error(message('只能在用户点击悬浮窗口后打开', 'Only available right after the user clicked the floating window')), { code: 'not-allowed' }));
        const token = floatingClickToken; floatingClickToken = '';
        return floatingRequest({ type: 'mincode.plugin.floating.activate', token, target });
      },
      resize(width, height) {
        if (surface !== 'floating') return Promise.reject(Object.assign(new Error(message('只有悬浮窗口内的页面可以调整窗口大小', 'Only the page in a floating window can resize it')), { code: 'not-allowed' }));
        if (![width, height].every(value => Number.isSafeInteger(value) && value >= 48 && value <= 480)) return Promise.reject(Object.assign(new Error(message('悬浮窗口尺寸必须为 48–480', 'Floating window size must be 48–480')), { code: 'invalid-request' }));
        return floatingRequest({ type: 'mincode.plugin.floating.resize', width, height });
      },
    },
    clipboard: {
      writeText(text, { sensitive = false } = {}) {
        if (!clipboardWriteSupported) return Promise.reject(Object.assign(new Error(message('宿主不支持剪贴板写入', 'Host does not support clipboard writing')), { code: 'not-allowed' }));
        if (typeof text !== 'string' || typeof sensitive !== 'boolean') return Promise.reject(Object.assign(new Error(message('剪贴板请求无效', 'Invalid clipboard request')), { code: 'invalid-request' }));
        return request({ type: 'mincode.plugin.clipboard.write-text', text, sensitive });
      },
    },
    confirm({ intent, subject } = {}) {
      if (!trustedConfirmSupported) return Promise.reject(Object.assign(new Error(message('宿主不支持可信确认', 'Host does not support trusted confirmation')), { code: 'not-allowed' }));
      if ((intent !== 'write' && intent !== 'dangerous') || typeof subject !== 'string' || !subject.trim()) return Promise.reject(Object.assign(new Error(message('确认请求无效', 'Invalid confirmation request')), { code: 'invalid-request' }));
      return request({ type: 'mincode.plugin.confirm', intent, subject: subject.trim() });
    },
    // ai.config: propose AI settings. The host compares them with the saved settings (preview, no key
    // values come back) and writes the picked ones only after its own confirmation (apply).
    aiConfig: {
      supported() { return aiConfigSupported; },
      preview(items) {
        if (!aiConfigSupported) return Promise.reject(Object.assign(new Error(message('宿主不支持提交 AI 设置', 'Host does not accept AI settings')), { code: 'not-allowed' }));
        if (!Array.isArray(items)) return Promise.reject(Object.assign(new Error(message('AI 设置请求无效', 'Invalid AI settings request')), { code: 'invalid-request' }));
        return request({ type: 'mincode.plugin.ai-config.preview', items: jsonCopy(items) });
      },
      apply(items, choices) {
        if (!aiConfigSupported) return Promise.reject(Object.assign(new Error(message('宿主不支持提交 AI 设置', 'Host does not accept AI settings')), { code: 'not-allowed' }));
        if (!Array.isArray(items) || !Array.isArray(choices)) return Promise.reject(Object.assign(new Error(message('AI 设置请求无效', 'Invalid AI settings request')), { code: 'invalid-request' }));
        // Waits for the user in the host confirmation, so it gets far longer than a normal request.
        return request({ type: 'mincode.plugin.ai-config.apply', items: jsonCopy(items), choices: jsonCopy(choices) }, aiConfigApplyTimeoutMs);
      },
    },
    // contributes.configuration: read the plugin's non-secret settings (secret
    // settings are only available to the plugin process) or open its settings page.
    configuration: {
      get(keys) {
        if (!configurationSupported) return Promise.reject(Object.assign(new Error(message('宿主不支持插件设置', 'Host does not support plugin settings')), { code: 'not-allowed' }));
        if (keys !== undefined && (!Array.isArray(keys) || keys.length > 256 || keys.some(key => typeof key !== 'string'))) return Promise.reject(Object.assign(new Error(message('设置请求无效', 'Invalid settings request')), { code: 'invalid-request' }));
        return request(keys === undefined ? { type: 'mincode.plugin.configuration.get' } : { type: 'mincode.plugin.configuration.get', keys }).then(result => result?.values ?? {});
      },
      open() {
        if (!configurationSupported) return Promise.reject(Object.assign(new Error(message('宿主不支持插件设置', 'Host does not support plugin settings')), { code: 'not-allowed' }));
        return request({ type: 'mincode.plugin.configuration.open' });
      },
    },
    // contributes.customEditors: the document bound by the host to this page (never a path from the page).
    document: {
      info() { return documentSupported && documentInfo ? { ...documentInfo } : null; },
      readAll(options) { return readAll(options); },
      async readText(options) { return new TextDecoder().decode(await readAll(options)); },
      save(content) { return saveDocument(content); },
      setDirty(dirty) {
        try { requireDocument(); } catch (error) { return Promise.reject(error); }
        if (typeof dirty !== 'boolean') return Promise.reject(documentError('dirty 必须是布尔值', 'dirty must be a boolean', 'invalid-request'));
        return request({ type: 'mincode.plugin.document.dirty', dirty });
      },
    },
    onDocumentSaveRequest(fn) { documentSaveHandler = typeof fn === 'function' ? fn : null; },
    // features.openRequest: fn({ requestId, source, entry, path?, pathParams?, params? }) for uriHandlers deep links and searchProviders results.
    onOpenRequest(fn) { openRequestHandler = typeof fn === 'function' ? fn : null; subscribeOpenRequests(); },
    tasks: {
      start(action, payload, timeoutMs = 300000) {
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) return Promise.reject(new Error(message('任务超时必须为 1–300000 毫秒', 'Task timeout must be 1–300000 ms')));
        return task('start', { action, payload, timeoutMs });
      },
      get(taskId) { return task('get', { taskId }); },
      cancel(taskId) { return task('cancel', { taskId }); },
      // features.taskEvents: true when the host pushes task snapshots (runTask then polls only as a fallback).
      pushSupported() { return taskEventsSupported; },
      onChanged(fn) {
        if (typeof fn !== 'function') return () => {};
        taskListeners.add(fn);
        return () => { taskListeners.delete(fn); };
      },
    },
  };
}
