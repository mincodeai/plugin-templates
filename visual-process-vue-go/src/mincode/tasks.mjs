// Shared helpers for running plugin actions as host tasks from a plugin page.
// Direct invokes are limited to about 30 s; tasks may run for minutes (AI turns,
// imports, conversions). Hosts with features.taskEvents push every snapshot
// change, so runTask updates at once and polls only as a fallback; older hosts
// are polled until the task finishes.

export const TASK_POLL_MS = 400;
// Fallback poll while the host pushes snapshots (transport.tasks.pushSupported()).
export const TASK_PUSH_POLL_MS = 2000;
export const TASK_TIMEOUT_MS = 300000;
// The Go SDK's CompleteAITurn callers time out at 170 s; leave room for the reply.
export const AI_TASK_TIMEOUT_MS = 180000;

const unsupportedPattern = /任务协议|task protocol/i;

/** True when the host does not support the task protocol (older MinCode). */
export function isTaskUnsupported(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return unsupportedPattern.test(message);
}

const cancelledError = () => Object.assign(new Error('cancelled'), { cancelled: true });
const uncertainError = (message, extra = {}) => Object.assign(new Error(message), { uncertain: true, ...extra });
const terminalStates = new Set(['succeeded', 'failed', 'cancelled']);

/**
 * Runs `action` as a host task and follows it until it finishes. `tasks` is
 * transport.tasks; when it reports pushSupported(), pushed snapshots
 * (onChanged) end the wait at once and pollMs defaults to TASK_PUSH_POLL_MS. onStart sees the first snapshot once the host accepted the
 * task; onSnapshot sees every snapshot (e.g. to show cancelRequested). While
 * the task runs, control.cancel cancels it and control.taskId holds its id.
 * alive() returning false stops polling with a `cancelled` error (the task is
 * cancelled too).
 *
 * Errors: `cancelled` (with any partial `result`); `uncertain` when the outcome
 * is unknown (no task id, a failed poll, polling past the deadline, or a
 * snapshot flagged `outcomeUnconfirmed`), so callers must not blindly retry;
 * otherwise the host's error text with `code` (snapshot.errorCode) and the
 * final `snapshot`.
 */
export async function runTask(tasks, action, payload, {
  timeoutMs = TASK_TIMEOUT_MS,
  pollMs,
  deadlineMs = timeoutMs + 10000,
  onStart = () => {},
  onSnapshot = () => {},
  onProgress = () => {},
  control = {},
  alive = () => true,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  const pushes = typeof tasks.onChanged === 'function' && tasks.pushSupported?.() === true;
  const interval = pollMs ?? (pushes ? TASK_PUSH_POLL_MS : TASK_POLL_MS);
  // Pushes may arrive before start() resolves; keep the latest per task until the id is known.
  const early = new Map();
  let taskId = '', pushed, wake = null;
  const unsubscribe = pushes ? tasks.onChanged(next => {
    if (!next?.taskId) return;
    if (!taskId) { if (early.size < 16 || early.has(next.taskId)) early.set(next.taskId, next); return; }
    if (next.taskId !== taskId) return;
    pushed = next;
    wake?.();
  }) : null;
  const waitForChange = ms => new Promise(resolve => {
    wake = resolve;
    Promise.resolve(sleep(ms)).then(resolve, resolve);
  }).finally(() => { wake = null; });
  let snapshot;
  try { snapshot = await tasks.start(action, payload, timeoutMs); }
  catch (error) { unsubscribe?.(); throw error; }
  taskId = snapshot?.taskId ?? '';
  pushed = early.get(taskId) ?? null;
  early.clear();
  if (!taskId) { unsubscribe?.(); throw uncertainError('task id missing', { snapshot }); }
  control.taskId = taskId;
  control.cancel = () => { void Promise.resolve(tasks.cancel(taskId)).catch(() => {}); };
  onStart(snapshot);
  const deadline = now() + deadlineMs;
  const stop = () => {
    control.cancel();
    throw cancelledError();
  };
  try {
    while (snapshot?.state === 'running') {
      onSnapshot(snapshot);
      if (snapshot.progress) onProgress(snapshot.progress);
      if (!alive()) stop();
      if (now() > deadline) {
        control.cancel();
        throw uncertainError('task polling stopped', { snapshot });
      }
      if (!pushed) await waitForChange(interval);
      if (!alive()) stop();
      if (pushed) {
        // A host-validated snapshot of this session's task: no extra round trip.
        snapshot = pushed;
        pushed = null;
        continue;
      }
      try {
        snapshot = await tasks.get(taskId);
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { uncertain: true });
      }
    }
  } finally {
    unsubscribe?.();
    control.cancel = null;
    control.taskId = '';
  }
  onSnapshot(snapshot);
  if (snapshot?.progress) onProgress(snapshot.progress);
  if (!terminalStates.has(snapshot?.state) || snapshot.outcomeUnconfirmed === true) {
    throw uncertainError('task outcome unconfirmed', { snapshot, result: snapshot?.result });
  }
  if (snapshot.state === 'succeeded') return snapshot.result;
  // A cancelled batch may still report the work it finished.
  if (snapshot.state === 'cancelled') throw Object.assign(cancelledError(), { result: snapshot.result, snapshot });
  const message = typeof snapshot.error === 'string' ? snapshot.error : snapshot.error?.message || 'task failed';
  throw Object.assign(new Error(message), { code: snapshot.errorCode ?? snapshot.error?.code, snapshot, result: snapshot.result });
}

/**
 * runTask, falling back to a direct transport.call when the host has no task
 * protocol (the action then runs under the shorter invoke limits).
 */
export async function runTaskOrCall(transport, action, payload, options = {}) {
  try {
    return await runTask(transport.tasks, action, payload, options);
  } catch (error) {
    if (!isTaskUnsupported(error)) throw error;
    return transport.call(action, payload);
  }
}

/**
 * Runs a backend action that asks the MinCode AI assistant (Go SDK
 * host.CompleteAITurn). The backend turns AI failures (rate limits, missing
 * capability, timeouts) into readable messages, so callers can show
 * error.message as is unless error.cancelled is set.
 */
export function runAIAction(transport, action, payload, options = {}) {
  return runTaskOrCall(transport, action, payload, { timeoutMs: AI_TASK_TIMEOUT_MS, ...options });
}

/** UTF-8 size of a string. */
export function utf8Length(text) {
  return new TextEncoder().encode(String(text ?? '')).length;
}

/** Longest prefix of text that fits in maxBytes of UTF-8, never splitting a surrogate pair. */
export function clipUtf8(text, maxBytes) {
  const value = String(text ?? '');
  if (utf8Length(value) <= maxBytes) return value;
  let low = 0, high = value.length;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (utf8Length(value.slice(0, mid)) <= maxBytes) low = mid; else high = mid - 1;
  }
  const cut = value.slice(0, low);
  return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut;
}
