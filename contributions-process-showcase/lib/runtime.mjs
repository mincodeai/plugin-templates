import readline from 'node:readline';

// Free-form view messages (onUIMessage / postUIMessage).
const MAX_UI_MESSAGE_BYTES = 256 * 1024;
const UI_VIEW_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_STORAGE_VALUE_BYTES = 256 * 1024;
// Every host accepts 64 KiB storage chunks; hosts with staged writes
// (host.storage.file.write.begin) accept 512 KiB. Mirrors file_storage.go.
const DEFAULT_STORAGE_FILE_CHUNK_BYTES = 64 * 1024;
const STAGED_STORAGE_FILE_CHUNK_BYTES = 512 * 1024;
const STORAGE_WRITE_BEGIN = 'host.storage.file.write.begin';
const DEFAULT_STORAGE_FILE_BYTES = 64 * 1024 * 1024;
const STORAGE_FILE_PATH_BYTES = 1024;
const DEFAULT_SHELL_OUTPUT_BYTES = 500_000;
const CONTEXT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const CONTEXT_VALUE_MAX_BYTES = 1024;
const ERROR_DATA_KEYS = new Set(['kind', 'tool', 'retryable']);
// Workspace files mirror wails-app/backend/plugin/workspace_host.go.
const WORKSPACE_READ_CHUNK_BYTES = 512 * 1024;
const WORKSPACE_WRITE_MAX_BYTES = 512 * 1024;
const DEFAULT_WORKSPACE_FILE_BYTES = 16 * 1024 * 1024;
const WORKSPACE_PATH_BYTES = 4096;
const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
export const HOST_EVENTS = Object.freeze(['workspace.changed', 'workspace.rootChanged', 'editor.activeFileChanged', 'editor.fileSaved', 'editor.selectionChanged', 'git.headChanged', 'ai.activity', 'ai.tasks']);

export class PluginError extends Error {
  constructor(code, message, { data, retryable = false, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'PluginError';
    this.code = code;
    this.retryable = Boolean(retryable);
    if (data !== undefined) this.data = data;
  }
}

export function pluginError(code, message, options) {
  return new PluginError(code, message, options);
}

function utf8Bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function safeErrorData(error) {
  const source = error?.data;
  const data = {};
  if (typeof error?.code === 'string' && error.code.length <= 128) data.kind = error.code;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    for (const key of ERROR_DATA_KEYS) {
      const value = source[key];
      if (typeof value === 'string' && value.length <= 128) data[key] = value;
      else if (key === 'retryable' && typeof value === 'boolean') data[key] = value;
    }
  }
  if (typeof error?.retryable === 'boolean') data.retryable = error.retryable;
  return Object.keys(data).length ? data : undefined;
}

function validateStorageKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) {
    throw pluginError('INVALID_ARGUMENT', 'Storage key must be 1–128 safe characters');
  }
  return key;
}

function validateStorageFilePath(path, { allowEmpty = false } = {}) {
  if (typeof path !== 'string' || (!allowEmpty && path.length === 0) || path.includes('\0')
    || path.startsWith('/') || path.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(path)
    || path.split(/[\\/]/).some(part => part === '..' || part === '.')) {
    throw pluginError('INVALID_ARGUMENT', 'Storage file path must be relative and stay inside the plugin storage directory');
  }
  if (path.trim() === '' ? !(allowEmpty && path === '') : path.split(/[\\/]/).some(part => part === '')) throw pluginError('INVALID_ARGUMENT', 'Storage file path is required');
  if (utf8Bytes(path) > STORAGE_FILE_PATH_BYTES) throw pluginError('INVALID_ARGUMENT', 'Storage file path is too long');
  return path.replaceAll('\\', '/');
}

function bytesFromFileInput(value) {
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  throw pluginError('INVALID_ARGUMENT', 'Storage file data must be a string, Uint8Array, or ArrayBuffer');
}

function missingStorageFile(path, onMissing) {
  if (onMissing === 'null') return null;
  if (onMissing === 'error') throw pluginError('FILE_NOT_FOUND', `Storage file not found: ${path}`);
  throw pluginError('INVALID_ARGUMENT', 'onMissing must be "null" or "error"');
}

function decodeStorageFileFrame(value, expectedOffset, path, onMissing) {
  if (value === null || (value && typeof value === 'object' && value.found === false)) {
    return missingStorageFile(path, onMissing);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.data !== 'string'
    || typeof value.eof !== 'boolean' || !Number.isSafeInteger(value.offset) || value.offset !== expectedOffset
    || (value.nextOffset !== undefined && (!Number.isSafeInteger(value.nextOffset) || value.nextOffset < expectedOffset))) {
    throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid storage file frame');
  }
  if (value.data.length > Math.ceil(STAGED_STORAGE_FILE_CHUNK_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data)) {
    throw pluginError('INVALID_HOST_RESULT', 'Host returned invalid storage file data');
  }
  let bytes;
  try { bytes = Buffer.from(value.data, 'base64'); }
  catch (cause) { throw pluginError('INVALID_HOST_RESULT', 'Host returned invalid storage file data', { cause }); }
  if (bytes.length === 0 && !value.eof) throw pluginError('INVALID_HOST_RESULT', 'Host returned an empty non-terminal storage file frame');
  const nextOffset = value.nextOffset ?? expectedOffset + bytes.length;
  if (nextOffset !== expectedOffset + bytes.length || (!value.eof && nextOffset <= expectedOffset)) {
    throw pluginError('INVALID_HOST_RESULT', 'Host returned a non-contiguous storage file frame');
  }
  return { bytes, eof: value.eof, nextOffset };
}

export function createStorageFilesAPI(host, {
  maxChunkBytes = STAGED_STORAGE_FILE_CHUNK_BYTES,
  maxFileBytes = DEFAULT_STORAGE_FILE_BYTES,
} = {}) {
  if (!Number.isSafeInteger(maxChunkBytes) || maxChunkBytes < 1 || maxChunkBytes > STAGED_STORAGE_FILE_CHUNK_BYTES) throw new TypeError('maxChunkBytes must be 1–524288');
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes < Math.min(maxChunkBytes, DEFAULT_STORAGE_FILE_CHUNK_BYTES)) throw new TypeError('maxFileBytes must be at least maxChunkBytes');
  // Chunks every host accepts; larger chunks and staged writes only after
  // host.api.describe reports host.storage.file.write.begin. The probe runs at
  // most once and only for bodies larger than one basic chunk.
  const basicChunkBytes = Math.min(maxChunkBytes, DEFAULT_STORAGE_FILE_CHUNK_BYTES);
  let stagedSupport;
  const supportsStaged = () => (stagedSupport ??= Promise.resolve()
    .then(() => host('host.api.describe', {}))
    .then(description => Array.isArray(description?.methods)
      && description.methods.some(method => method?.name === STORAGE_WRITE_BEGIN && method.available === true), () => false));
  const writeStaged = async (validatedPath, bytes) => {
    const begin = await host(STORAGE_WRITE_BEGIN, { path: validatedPath });
    if (!begin || typeof begin !== 'object' || typeof begin.session !== 'string' || begin.session.length === 0) {
      throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid storage write session');
    }
    const hostChunk = Number.isSafeInteger(begin.maxChunkBytes) && begin.maxChunkBytes > 0 ? begin.maxChunkBytes : DEFAULT_STORAGE_FILE_CHUNK_BYTES;
    const chunkBytes = Math.min(hostChunk, maxChunkBytes);
    try {
      for (let start = 0; start < bytes.length; start += chunkBytes) {
        const chunk = bytes.subarray(start, Math.min(start + chunkBytes, bytes.length));
        await host('host.storage.file.write.append', { session: begin.session, offset: start, data: chunk.toString('base64') });
      }
    } catch (error) {
      // Best effort: the host also drops idle sessions on its own.
      await Promise.resolve().then(() => host('host.storage.file.write.abort', { session: begin.session })).catch(() => {});
      throw error;
    }
    if (await host('host.storage.file.write.commit', { session: begin.session, size: bytes.length }) !== true) {
      throw pluginError('INVALID_HOST_RESULT', 'Host did not confirm storage file commit');
    }
    return { bytesWritten: bytes.length, offset: bytes.length };
  };
  const read = async (path, { offset = 0, maxBytes = maxFileBytes, onMissing = 'null' } = {}) => {
    const validatedPath = validateStorageFilePath(path);
    if (onMissing !== 'null' && onMissing !== 'error') throw pluginError('INVALID_ARGUMENT', 'onMissing must be "null" or "error"');
    if (!Number.isSafeInteger(offset) || offset < 0) throw pluginError('INVALID_ARGUMENT', 'Storage file offset must be a non-negative integer');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > maxFileBytes) throw pluginError('INVALID_ARGUMENT', 'Storage file maxBytes exceeds the SDK limit');
    if (maxBytes === 0) return Buffer.alloc(0);
    const chunks = [];
    let cursor = offset;
    let total = 0;
    let chunkBytes = basicChunkBytes;
    while (total < maxBytes) {
      if (chunks.length === 1 && maxChunkBytes > basicChunkBytes && await supportsStaged()) chunkBytes = maxChunkBytes;
      const requested = Math.min(chunkBytes, maxBytes - total);
      const response = await host('host.storage.file.read', { path: validatedPath, offset: cursor, maxBytes: requested });
      if (cursor !== offset && (response === null || (response && typeof response === 'object' && response.found === false))) {
        throw pluginError('INVALID_HOST_RESULT', 'Storage file disappeared during read');
      }
      const frame = decodeStorageFileFrame(response, cursor, validatedPath, onMissing);
      if (frame === null) return null;
      if (frame.bytes.length > requested || total + frame.bytes.length > maxBytes) throw pluginError('INVALID_HOST_RESULT', 'Host returned an oversized storage file frame');
      chunks.push(frame.bytes); total += frame.bytes.length; cursor = frame.nextOffset;
      if (frame.eof) return Buffer.concat(chunks, total);
    }
    throw pluginError('RESULT_TOO_LARGE', 'Storage file read exceeds the SDK limit');
  };
  const write = async (path, value, { offset = 0, truncate = true } = {}) => {
    const validatedPath = validateStorageFilePath(path);
    const bytes = bytesFromFileInput(value);
    if (!Number.isSafeInteger(offset) || offset < 0 || typeof truncate !== 'boolean') throw pluginError('INVALID_ARGUMENT', 'Invalid storage file write options');
    if (bytes.length > maxFileBytes || offset > maxFileBytes - bytes.length) throw pluginError('PAYLOAD_TOO_LARGE', 'Storage file exceeds the SDK limit');
    let cursor = offset;
    if (bytes.length === 0) {
      if (await host('host.storage.file.write', { path: validatedPath, offset, data: '', truncate }) !== true) throw pluginError('INVALID_HOST_RESULT', 'Host did not confirm storage file write');
      return { bytesWritten: 0, offset };
    }
    // Whole-file replacements larger than one protocol chunk (64 KiB) are
    // staged when the host supports it: linear in the file size and atomic.
    if (offset === 0 && truncate && bytes.length > DEFAULT_STORAGE_FILE_CHUNK_BYTES && await supportsStaged()) return writeStaged(validatedPath, bytes);
    for (let start = 0; start < bytes.length; start += basicChunkBytes) {
      const chunk = bytes.subarray(start, Math.min(start + basicChunkBytes, bytes.length));
      if (await host('host.storage.file.write', { path: validatedPath, offset: cursor, data: chunk.toString('base64'), truncate: truncate && start === 0 }) !== true) {
        throw pluginError('INVALID_HOST_RESULT', 'Host did not confirm storage file write');
      }
      cursor += chunk.length;
    }
    return { bytesWritten: bytes.length, offset: cursor };
  };
  // Replaces the whole file atomically: readers see the old or the complete new
  // content. One-chunk bodies use a single (atomic) write; larger bodies need a
  // host with staged writes and otherwise fail with UNSUPPORTED, untouched.
  const writeAtomic = async (path, value) => {
    const validatedPath = validateStorageFilePath(path);
    const bytes = bytesFromFileInput(value);
    if (bytes.length > maxFileBytes) throw pluginError('PAYLOAD_TOO_LARGE', 'Storage file exceeds the SDK limit');
    if (bytes.length <= basicChunkBytes) return write(validatedPath, bytes);
    if (!await supportsStaged()) throw pluginError('UNSUPPORTED', 'This MinCode host does not support atomic multi-chunk storage writes');
    return writeStaged(validatedPath, bytes);
  };

  return {
    read,
    write,
    writeAtomic,

    delete: path => host('host.storage.file.delete', { path: validateStorageFilePath(path) }),
    list: (path = '') => host('host.storage.file.list', { path: validateStorageFilePath(path, { allowEmpty: true }) }),
    stat: path => host('host.storage.file.stat', { path: validateStorageFilePath(path) }),
  };
}

export function createStorageAPI(host, { maxValueBytes = DEFAULT_STORAGE_VALUE_BYTES, maxChunkBytes, maxFileBytes } = {}) {
  if (!Number.isSafeInteger(maxValueBytes) || maxValueBytes < 1) throw new TypeError('maxValueBytes must be a positive integer');
  return {
    get: key => host('host.storage.get', { key: validateStorageKey(key) }),
    async set(key, value) {
      const validatedKey = validateStorageKey(key);
      let serialized;
      try { serialized = JSON.stringify(value); }
      catch (cause) { throw pluginError('INVALID_ARGUMENT', 'Storage value must be JSON serializable', { cause }); }
      if (serialized === undefined) throw pluginError('INVALID_ARGUMENT', 'Storage value must be JSON serializable');
      if (utf8Bytes(serialized) > maxValueBytes) throw pluginError('PAYLOAD_TOO_LARGE', 'Storage value exceeds the SDK limit');
      return host('host.storage.set', { key: validatedKey, value });
    },
    delete: key => host('host.storage.delete', { key: validateStorageKey(key) }),
    keys: () => host('host.storage.list', {}),
    files: createStorageFilesAPI(host, { ...(maxChunkBytes === undefined ? {} : { maxChunkBytes }), ...(maxFileBytes === undefined ? {} : { maxFileBytes }) }),
  };
}

// Command context keys/values mirror the host-side bounds in
// wails-app/backend/plugin/command_context.go; the host re-validates everything.
function validateContextKey(key) {
  if (typeof key !== 'string' || !CONTEXT_KEY_PATTERN.test(key)) {
    throw pluginError('INVALID_ARGUMENT', 'Context key must match ^[a-z0-9][a-z0-9._-]{0,63}$');
  }
  return key;
}

function validateContextValue(value) {
  if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw pluginError('INVALID_ARGUMENT', 'Context value must be a string, number, boolean, or null');
  }
  const serialized = JSON.stringify(value);
  if (utf8Bytes(serialized) > CONTEXT_VALUE_MAX_BYTES) throw pluginError('PAYLOAD_TOO_LARGE', 'Context value exceeds 1 KiB');
  return value;
}

// Requires the `commands` capability; the host keeps context in memory only.
export function createContextAPI(host) {
  return {
    set: (key, value) => host('host.context.set', { key: validateContextKey(key), value: validateContextValue(value) }),
  };
}

// Plugin settings (contributes.configuration). Values are read-only for the
// plugin; the user edits them on Settings > Plugins. get() returns the
// effective values (default -> global -> active-workspace override), including
// secret settings, as a plain object; unset settings without a default are absent.
function validateConfigurationKeys(keys) {
  if (keys === undefined) return undefined;
  if (!Array.isArray(keys) || keys.length > 256 || keys.some(key => typeof key !== 'string' || key.length === 0 || key.length > 64)) {
    throw pluginError('INVALID_ARGUMENT', 'Configuration keys must be a list of at most 256 setting keys');
  }
  return keys;
}

export function createConfigurationAPI(host) {
  return {
    async get(keys) {
      const validated = validateConfigurationKeys(keys);
      const result = await host('host.configuration.get', validated === undefined ? {} : { keys: validated });
      if (!result || typeof result !== 'object' || Array.isArray(result) || !result.values || typeof result.values !== 'object' || Array.isArray(result.values)) {
        throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid configuration result');
      }
      return result.values;
    },
  };
}

// Status bar items (contributes.statusBar). Requires the `commands`
// capability; only items declared with `"dynamic": true` can be updated.
// Fields: text (single line, <= 48 characters), tooltip (<= 256), severity
// ('normal' | 'warning' | 'error'), busy, visible. The host coalesces pushes
// (latest wins), silently drops updates beyond 50/s, and clears all dynamic
// state when the plugin stops, crashes, is disabled, reloaded or uninstalled.
const STATUS_BAR_UPDATE_FIELDS = new Set(['text', 'tooltip', 'severity', 'busy', 'visible']);

function validateStatusBarItemId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
    throw pluginError('INVALID_ARGUMENT', 'Status bar item id must be a declared item id');
  }
  return id;
}

export function createStatusBarAPI(host) {
  return {
    update(id, fields = {}) {
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        throw pluginError('INVALID_ARGUMENT', 'Status bar update fields must be an object');
      }
      const params = { id: validateStatusBarItemId(id) };
      for (const [key, value] of Object.entries(fields)) {
        if (!STATUS_BAR_UPDATE_FIELDS.has(key)) throw pluginError('INVALID_ARGUMENT', `Unknown status bar field ${key}`);
        if (value !== undefined) params[key] = value;
      }
      return host('host.statusBar.update', params);
    },
    reset(id) {
      return host('host.statusBar.reset', id === undefined ? {} : { id: validateStatusBarItemId(id) });
    },
  };
}

export function quoteShellArgument(value) {
  const text = String(value);
  if (text.includes('\0')) throw pluginError('INVALID_ARGUMENT', 'Shell argument contains NUL');
  return "'" + text.replaceAll("'", "'\\''") + "'";
}

function parseShellResult(value) {
  let output = value;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); }
    catch (cause) { throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid shell result', { cause }); }
  }
  if (!output || typeof output !== 'object' || Array.isArray(output)
    || typeof output.success !== 'boolean' || typeof output.stdout !== 'string'
    || typeof output.stderr !== 'string' || !Number.isSafeInteger(output.exit_code)) {
    throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid shell result');
  }
  return output;
}

export function createShellAPI(host, { maxOutputBytes = DEFAULT_SHELL_OUTPUT_BYTES } = {}) {
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) throw new TypeError('maxOutputBytes must be a positive integer');
  return {
    async run(command, { cwd = '.', seconds = 15 } = {}) {
      if (typeof command !== 'string' || !command.trim()) throw pluginError('INVALID_ARGUMENT', 'Shell command is required');
      if (typeof cwd !== 'string' || !cwd.trim()) throw pluginError('INVALID_ARGUMENT', 'Shell working directory is required');
      if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 300) throw pluginError('INVALID_ARGUMENT', 'Shell timeout must be 1–300 seconds');
      let output;
      try { output = parseShellResult(await host('host.shell.exec', { command, cwd, timeoutSecs: seconds })); }
      catch (cause) {
        if (cause instanceof PluginError && !['HOST_TIMEOUT', 'HOST_CLOSED'].includes(cause.code)) throw cause;
        const denied = cause?.code === -32001 || cause?.code === 'PERMISSION_DENIED';
        const timedOut = cause?.code === 'HOST_TIMEOUT' || cause?.code === 'TIMEOUT';
        throw pluginError(denied ? 'PERMISSION_DENIED' : timedOut ? 'TIMEOUT' : 'HOST_UNAVAILABLE', 'Host shell execution failed', { retryable: !denied, cause });
      }
      if (utf8Bytes(output.stdout) > maxOutputBytes || utf8Bytes(output.stderr) > maxOutputBytes
        || output.stdout.includes('[app] stdout truncated') || output.stderr.includes('[app] stderr truncated')) {
        throw pluginError('RESULT_TOO_LARGE', 'Shell output exceeds the SDK limit');
      }
      return output;
    },
    async exec(args, options = {}) {
      if (!Array.isArray(args) || args.length === 0) throw pluginError('INVALID_ARGUMENT', 'Shell arguments are required');
      let command = args.map(quoteShellArgument).join(' ');
      if (options.stdin !== undefined) command = `printf '%s' ${quoteShellArgument(options.stdin)} | ${command}`;
      if (options.cwd) command = `cd ${quoteShellArgument(options.cwd)} && ${command}`;
      const output = await this.run(command, { seconds: options.seconds ?? 15 });
      if (!output.success) {
        const code = output.exit_code === 127 ? 'TOOL_NOT_FOUND' : 'PROCESS_FAILED';
        throw pluginError(code, code === 'TOOL_NOT_FOUND' ? 'External tool was not found' : `External tool failed with exit code ${output.exit_code}`, {
          data: { tool: String(args[0]).slice(0, 128), kind: 'shell' },
          cause: output,
        });
      }
      return output.stdout;
    },
  };
}

// Credentials only (capability `secrets`): machine-bound encryption, bound to
// this plugin, at most 256 keys of 64 KiB. Store them only after the user opted in.
function validateSecretKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) {
    throw pluginError('INVALID_ARGUMENT', 'Secret key must be 1–128 safe characters');
  }
  return key;
}

export function createSecretsAPI(host) {
  return {
    get: async key => (await host('host.secrets.get', { key: validateSecretKey(key) })) ?? null,
    set(key, value) {
      if (typeof value !== 'string') throw pluginError('INVALID_ARGUMENT', 'Secret value must be a string');
      return host('host.secrets.set', { key: validateSecretKey(key), value });
    },
    delete: key => host('host.secrets.delete', { key: validateSecretKey(key) }),
    keys: () => host('host.secrets.list', {}),
  };
}

// Capability `clipboard`. read({ since }) returns { changed, seq, text, concealed, truncated };
// concealed content (password managers, one-time codes) is never returned.
export function createClipboardAPI(host) {
  return {
    read({ since = 0 } = {}) {
      if (!Number.isSafeInteger(since) || since < 0) throw pluginError('INVALID_ARGUMENT', 'since must be a non-negative integer');
      return host('host.clipboard.read', { since });
    },
    write(text) {
      if (typeof text !== 'string') throw pluginError('INVALID_ARGUMENT', 'Clipboard text must be a string');
      if (utf8Bytes(text) > 1024 * 1024) throw pluginError('PAYLOAD_TOO_LARGE', 'Clipboard text exceeds 1 MiB');
      return host('host.clipboard.write', { text });
    },
  };
}

// Capability `notifications`: title <= 80, body <= 500 characters, at most 10 per minute.
export function createNotificationsAPI(host) {
  return {
    notify({ title, body, level = 'info', system = false, viewId } = {}) {
      if (typeof title !== 'string' || !title.trim() || [...title].length > 80) throw pluginError('INVALID_ARGUMENT', 'Notification title must be 1–80 characters');
      if (body !== undefined && (typeof body !== 'string' || [...body].length > 500)) throw pluginError('INVALID_ARGUMENT', 'Notification body must be at most 500 characters');
      if (!['info', 'success', 'warning', 'error'].includes(level)) throw pluginError('INVALID_ARGUMENT', 'Notification level must be info, success, warning or error');
      return host('host.notify', { title, ...(body === undefined ? {} : { body }), level, system: Boolean(system), ...(viewId === undefined ? {} : { viewId }) });
    },
  };
}

// Capability `ai`: run MinCode AI turns on behalf of the user (see the Go SDK host/ai.go).
export function createAIAPI(host) {
  const id = value => {
    if (typeof value !== 'string' || !value) throw pluginError('INVALID_ARGUMENT', 'AI turn id is required');
    return value;
  };
  return {
    plugins: () => host('host.ai.plugins', {}),
    grants: () => host('host.ai.grants', {}),
    start(request) {
      if (!request || typeof request !== 'object' || typeof request.conversationKey !== 'string' || typeof request.prompt !== 'string' || !Array.isArray(request.allowedPlugins)) {
        throw pluginError('INVALID_ARGUMENT', 'AI turn needs conversationKey, prompt and allowedPlugins');
      }
      return host('host.ai.turn.start', request);
    },
    poll: turnId => host('host.ai.turn.poll', { id: id(turnId) }),
    cancel: turnId => host('host.ai.turn.cancel', { id: id(turnId) }),
    approve: (turnId, approvalId, approved) => host('host.ai.turn.approve', { id: id(turnId), approvalId: id(approvalId), approved: Boolean(approved) }),
  };
}

// No capability required. describe() lists the host methods, events and limits this plugin may use.
export function createHostAPI(host) {
  return {
    info: () => host('host.info', {}),
    describe: () => host('host.api.describe', {}),
    log(level, message) {
      if (!LOG_LEVELS.has(level)) throw pluginError('INVALID_ARGUMENT', 'Log level must be debug, info, warn or error');
      if (typeof message !== 'string' || !message.trim()) throw pluginError('INVALID_ARGUMENT', 'Log message is required');
      return host('host.log', { level, message });
    },
  };
}

function validateWorkspacePath(path, { allowEmpty = false } = {}) {
  if (typeof path !== 'string' || path.includes('\0') || path.startsWith('/') || path.startsWith('\\')
    || /^[A-Za-z]:/.test(path) || path.split(/[\\/]/).some(part => part === '..')) {
    throw pluginError('INVALID_ARGUMENT', 'Workspace path must be relative to the workspace root');
  }
  if (!allowEmpty && !path.trim()) throw pluginError('INVALID_ARGUMENT', 'Workspace path is required');
  if (utf8Bytes(path) > WORKSPACE_PATH_BYTES) throw pluginError('INVALID_ARGUMENT', 'Workspace path is too long');
  return path.replaceAll('\\', '/');
}

const WORKSPACE_ERROR_CODES = {
  no_root: 'NO_WORKSPACE', not_found: 'FILE_NOT_FOUND', denied: 'PERMISSION_DENIED', conflict: 'CONFLICT',
  too_large: 'PAYLOAD_TOO_LARGE', not_file: 'NOT_A_FILE', not_directory: 'NOT_A_DIRECTORY', invalid_path: 'INVALID_ARGUMENT',
};

async function workspaceCall(host, method, params) {
  try { return await host(method, params); }
  catch (cause) {
    const mapped = WORKSPACE_ERROR_CODES[cause?.data?.code];
    if (mapped) throw pluginError(mapped, cause.message, { cause });
    if (cause?.code === -32001) throw pluginError('PERMISSION_DENIED', cause.message, { cause });
    throw cause;
  }
}

// Workspace files through the host (capabilities `workspace.read` / `workspace.write`).
// Paths are relative to the active workspace root; VCS internals and credential
// files are never accessible. write() replaces a whole file atomically (<= 512 KiB):
// pass expectedSha256 from stat({ sha256: true }) to detect concurrent edits, or
// createOnly to refuse overwriting.
export function createWorkspaceAPI(host, { maxFileBytes = DEFAULT_WORKSPACE_FILE_BYTES } = {}) {
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1) throw new TypeError('maxFileBytes must be a positive integer');
  const readChunk = async (path, { offset = 0, maxBytes = WORKSPACE_READ_CHUNK_BYTES } = {}) => {
    if (!Number.isSafeInteger(offset) || offset < 0) throw pluginError('INVALID_ARGUMENT', 'offset must be a non-negative integer');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > WORKSPACE_READ_CHUNK_BYTES) throw pluginError('INVALID_ARGUMENT', 'maxBytes must be 1–524288');
    const frame = await workspaceCall(host, 'host.workspace.read', { path: validateWorkspacePath(path), offset, maxBytes });
    if (!frame || typeof frame.data !== 'string' || typeof frame.eof !== 'boolean' || !Number.isSafeInteger(frame.nextOffset) || !Number.isSafeInteger(frame.size)) {
      throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid workspace read frame');
    }
    return { bytes: Buffer.from(frame.data, 'base64'), offset: frame.offset, nextOffset: frame.nextOffset, eof: frame.eof, size: frame.size, modifiedAt: frame.modifiedAt };
  };
  const read = async (path, { maxBytes = maxFileBytes } = {}) => {
    const chunks = [];
    let offset = 0;
    for (;;) {
      const frame = await readChunk(path, { offset, maxBytes: WORKSPACE_READ_CHUNK_BYTES });
      if (frame.size > maxBytes) throw pluginError('RESULT_TOO_LARGE', 'Workspace file exceeds the SDK limit');
      chunks.push(frame.bytes);
      offset = frame.nextOffset;
      if (frame.eof) return Buffer.concat(chunks);
      if (frame.bytes.length === 0) throw pluginError('INVALID_HOST_RESULT', 'Host returned an empty non-terminal workspace frame');
    }
  };
  return {
    async root() {
      const result = await workspaceCall(host, 'host.workspace.root', {});
      return typeof result?.root === 'string' ? result.root : null;
    },
    list: (path = '') => workspaceCall(host, 'host.workspace.list', { path: validateWorkspacePath(path, { allowEmpty: true }) }),
    stat: (path, { sha256 = false } = {}) => workspaceCall(host, 'host.workspace.stat', { path: validateWorkspacePath(path), sha256: Boolean(sha256) }),
    readChunk,
    read,
    readText: async (path, options) => (await read(path, options)).toString('utf8'),
    write(path, value, { expectedSha256, createOnly = false, createParents = false } = {}) {
      const bytes = bytesFromFileInput(value);
      if (bytes.length > WORKSPACE_WRITE_MAX_BYTES) throw pluginError('PAYLOAD_TOO_LARGE', 'Workspace writes are limited to 512 KiB');
      if (expectedSha256 !== undefined && (typeof expectedSha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(expectedSha256))) {
        throw pluginError('INVALID_ARGUMENT', 'expectedSha256 must be a hex SHA-256 digest');
      }
      const precondition = createOnly ? { expectedSha256: '' } : expectedSha256 === undefined ? {} : { expectedSha256 };
      return workspaceCall(host, 'host.workspace.write', { path: validateWorkspacePath(path), data: bytes.toString('base64'), createParents: Boolean(createParents), ...precondition });
    },
  };
}

function validateHostEvents(events) {
  if (!Array.isArray(events) || events.length > 16 || events.some(event => !HOST_EVENTS.includes(event))) {
    throw pluginError('INVALID_ARGUMENT', `Events must be a list of ${HOST_EVENTS.join(', ')}`);
  }
  return [...new Set(events)];
}

// Replaces this process's subscriptions; [] unsubscribes. Prefer the `events`
// option of start(), which subscribes right after initialize.
export function createEventsAPI(host) {
  return {
    subscribe: events => host('host.events.subscribe', { events: validateHostEvents(events) }),
  };
}

// Services (host.services.*, see the Go SDK host/services.go). Callers need
// the `plugins` capability; providers need nothing extra. invoke() waits for
// the result; start() + wait() report progress, cancel() stops a call (not
// rollback). Inputs: text (a string), or file sources [{ source: 'workspace'
// | 'storage', path } | { source: 'upload', token }]. File outputs are
// tokens: files.read / files.save (into the caller's storage) / files.release.
// A provider's action receives the envelope decodeServiceRequest() reads; it
// reads inputs with files.read, writes outputs with files.create(callId, ...)
// and returns { text } | { json } | { files: [token] } | {}. With tasks
// negotiated it reports progress with reportProgress({ completed?, total?, message? }).
const SERVICE_CHUNK_BYTES = 512 * 1024;
const SERVICE_FILE_MAX_BYTES = 64 * 1024 * 1024;
const SERVICE_PROMPT_TIMEOUT_MS = 25_000;
const SERVICE_EXEC_TIMEOUT_MS = 300_000;
const SERVICE_REPLY_MARGIN_MS = 5_000;
const SERVICE_SAVE_TIMEOUT_MS = 60_000;

function serviceCallParams(call) {
  if (!call || typeof call !== 'object' || typeof call.service !== 'string' || !call.service) throw pluginError('INVALID_ARGUMENT', 'A service call requires a service');
  const { service, provider, input, params, timeoutMs, execTimeoutMs } = call;
  if (input !== undefined && typeof input !== 'string' && !(Array.isArray(input) && input.length > 0)) throw pluginError('INVALID_ARGUMENT', 'Service input must be text or a non-empty list of file sources');
  if (provider !== undefined && (typeof provider?.pluginId !== 'string' || !provider.pluginId)) throw pluginError('INVALID_ARGUMENT', 'provider must be { pluginId, entryId? }');
  if (params !== undefined && (!params || typeof params !== 'object' || Array.isArray(params))) throw pluginError('INVALID_ARGUMENT', 'Service params must be an object');
  for (const [name, value] of [['timeoutMs', timeoutMs], ['execTimeoutMs', execTimeoutMs]]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > SERVICE_EXEC_TIMEOUT_MS)) throw pluginError('INVALID_ARGUMENT', `${name} must be 1–300000`);
  }
  return {
    params: { service, ...(provider === undefined ? {} : { provider }), ...(input === undefined ? {} : { input }), ...(params === undefined ? {} : { params }), ...(timeoutMs === undefined ? {} : { timeoutMs }) },
    promptMs: timeoutMs ?? SERVICE_PROMPT_TIMEOUT_MS,
    execMs: execTimeoutMs ?? SERVICE_EXEC_TIMEOUT_MS,
  };
}

function validServiceId(value, what) {
  if (typeof value !== 'string' || !value) throw pluginError('INVALID_ARGUMENT', `Service ${what} is required`);
  return value;
}

// The service error code of a failure: the host's data.code ('not_found',
// 'too_large', 'busy', 'timeout', 'cancelled', ...) or '' when there is none.
export function serviceErrorCode(error) {
  const code = error?.data?.code;
  return typeof code === 'string' ? code : '';
}

function serviceCallFailure(snapshot) {
  let code = 'cancelled';
  let message = 'The service call was cancelled';
  if (snapshot.state === 'failed') {
    message = typeof snapshot.error === 'string' && snapshot.error ? snapshot.error : 'The service call failed';
    const prefix = message.split(':', 1)[0];
    code = message.includes(':') && prefix && !/\s/.test(prefix) ? prefix : 'plugin_error';
  }
  return pluginError(code === 'cancelled' ? 'CANCELLED' : 'SERVICE_FAILED', message, {
    data: { code, state: snapshot.state, callId: snapshot.callId, unconfirmed: snapshot.unconfirmed === true },
  });
}

const serviceDelay = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return; }
  const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

export function createServicesAPI(host, { maxChunkBytes = SERVICE_CHUNK_BYTES, maxFileBytes = SERVICE_FILE_MAX_BYTES, pollIntervalsMs = [250, 500, 1000] } = {}) {
  if (!Number.isSafeInteger(maxChunkBytes) || maxChunkBytes < 1 || maxChunkBytes > SERVICE_CHUNK_BYTES) throw new TypeError('maxChunkBytes must be 1–524288');
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > SERVICE_FILE_MAX_BYTES) throw new TypeError('maxFileBytes must be 1–67108864');
  if (!Array.isArray(pollIntervalsMs) || pollIntervalsMs.length === 0 || pollIntervalsMs.some(ms => !Number.isSafeInteger(ms) || ms < 1)) throw new TypeError('pollIntervalsMs must be a list of positive integers');

  // Checked before a session opens: bad or oversized data never reaches the host.
  const toBytes = value => {
    let bytes;
    try { bytes = bytesFromFileInput(value); }
    catch (cause) { throw pluginError('INVALID_ARGUMENT', 'Service file data must be a string, Uint8Array, or ArrayBuffer', { cause }); }
    if (bytes.length > maxFileBytes) throw pluginError('PAYLOAD_TOO_LARGE', 'Service file exceeds the SDK limit');
    return bytes;
  };
  const writeChunks = async (method, session, hostChunk, bytes) => {
    const chunkBytes = Number.isSafeInteger(hostChunk) && hostChunk > 0 ? Math.min(hostChunk, maxChunkBytes) : maxChunkBytes;
    for (let start = 0; start < bytes.length; start += chunkBytes) {
      await host(method, { session, offset: start, data: bytes.subarray(start, Math.min(start + chunkBytes, bytes.length)).toString('base64') });
    }
  };
  const beginSession = async (method, params) => {
    const begin = await host(method, params);
    if (!begin || typeof begin.session !== 'string' || !begin.session) throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid service file session');
    return begin;
  };
  const committedToken = file => {
    if (!file || typeof file.token !== 'string' || !file.token) throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid service file');
    return file.token;
  };
  const status = async callId => {
    const snapshot = await host('host.services.status', { callId: validServiceId(callId, 'call id') });
    if (!snapshot || typeof snapshot.state !== 'string') throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid service call snapshot');
    return snapshot;
  };

  return {
    async list(service) {
      const result = await host('host.services.list', service === undefined ? {} : { service: validServiceId(service, 'name') });
      if (!Array.isArray(result?.services)) throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid service list');
      return result.services;
    },
    // Waits for the prompts (timeoutMs, default 25 s), the provider's run
    // (execTimeoutMs, SDK-only, default the 300 s maximum) and a 5 s margin.
    invoke(call) {
      const { params, promptMs, execMs } = serviceCallParams(call);
      return host('host.services.invoke', params, { timeoutMs: promptMs + execMs + SERVICE_REPLY_MARGIN_MS });
    },
    // Resolves with { callId, provider } once the prompts are done.
    start(call) {
      const { params, promptMs } = serviceCallParams(call);
      return host('host.services.start', params, { timeoutMs: promptMs + SERVICE_REPLY_MARGIN_MS });
    },
    status,
    cancel: callId => host('host.services.cancel', { callId: validServiceId(callId, 'call id') }),
    // Polls after 250 ms, 500 ms, then every second; onProgress gets each
    // changed progress ({ completed?, total?, message?, raw? }). A failed or
    // cancelled call rejects with a PluginError whose data holds { code,
    // state, callId, unconfirmed }. Aborting `signal` stops the wait, not the call.
    async wait(callId, { onProgress, signal } = {}) {
      validServiceId(callId, 'call id');
      let last;
      for (let attempt = 0; ; attempt++) {
        await serviceDelay(pollIntervalsMs[Math.min(attempt, pollIntervalsMs.length - 1)], signal);
        const snapshot = await status(callId);
        if (onProgress && snapshot.progress && typeof snapshot.progress === 'object') {
          const progress = { ...snapshot.progress, ...(snapshot.rawProgress === undefined ? {} : { raw: snapshot.rawProgress }) };
          const key = JSON.stringify(progress);
          if (key !== last) { last = key; onProgress(progress); }
        }
        if (snapshot.state === 'succeeded') return { provider: snapshot.provider, output: snapshot.output ?? null };
        if (snapshot.state === 'failed' || snapshot.state === 'cancelled') throw serviceCallFailure(snapshot);
        if (snapshot.state !== 'running') throw pluginError('INVALID_HOST_RESULT', 'Host returned an unknown service call state');
      }
    },
    files: {
      // Uploads data (≤ 64 MiB) for an { source: 'upload', token } input.
      async upload(name, value) {
        validServiceId(name, 'file name');
        const bytes = toBytes(value);
        const begin = await beginSession('host.services.file.upload.begin', {});
        await writeChunks('host.services.file.upload.append', begin.session, begin.maxChunkBytes, bytes);
        return committedToken(await host('host.services.file.upload.commit', { session: begin.session, name }));
      },
      // Reads a whole file (an input for a provider, an output for a caller).
      async read(token, { maxBytes = maxFileBytes } = {}) {
        validServiceId(token, 'file token');
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > maxFileBytes) throw pluginError('INVALID_ARGUMENT', 'maxBytes exceeds the SDK limit');
        const chunks = [];
        let offset = 0;
        for (;;) {
          const frame = await host('host.services.file.read', { token, offset, length: maxChunkBytes });
          if (typeof frame?.data !== 'string' || frame.data.length > Math.ceil(maxChunkBytes / 3) * 4) throw pluginError('INVALID_HOST_RESULT', 'Host returned an invalid service file chunk');
          const bytes = Buffer.from(frame.data, 'base64');
          if (offset + bytes.length > maxBytes) throw pluginError('RESULT_TOO_LARGE', 'Service file exceeds the SDK limit');
          chunks.push(bytes);
          offset += bytes.length;
          // The host returns full chunks until the end of the file.
          if (bytes.length < maxChunkBytes) return Buffer.concat(chunks, offset);
        }
      },
      // Copies an output into the caller's file storage (capability `storage`).
      save(token, path) {
        return host('host.services.file.save', { token: validServiceId(token, 'file token'), path: validateStorageFilePath(path) }, { timeoutMs: SERVICE_SAVE_TIMEOUT_MS });
      },
      release: token => host('host.services.file.release', { token: validServiceId(token, 'file token') }),
      // Provider side: writes an output file of the running call callId.
      async create(callId, name, value) {
        validServiceId(callId, 'call id');
        validServiceId(name, 'file name');
        const bytes = toBytes(value);
        const begin = await beginSession('host.services.file.create.begin', { callId, name });
        await writeChunks('host.services.file.create.append', begin.session, begin.maxChunkBytes, bytes);
        return committedToken(await host('host.services.file.create.commit', { session: begin.session }));
      },
    },
  };
}

// Reads the payload a provider's action receives: { callId, service, entry,
// text?, files?, params, caller }.
export function decodeServiceRequest(payload) {
  const invalid = () => pluginError('INVALID_ARGUMENT', 'Invalid service request');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalid();
  const { callId, service, entry, input, params, caller } = payload;
  if (![callId, service, entry].every(value => typeof value === 'string' && value)) throw invalid();
  if (input !== undefined && input !== null && typeof input !== 'string' && !Array.isArray(input)) throw invalid();
  return {
    callId, service, entry,
    text: typeof input === 'string' ? input : undefined,
    files: Array.isArray(input) ? input : undefined,
    params: params && typeof params === 'object' && !Array.isArray(params) ? params : {},
    caller: caller && typeof caller === 'object' ? caller : {},
  };
}

// Framed transport (plugin.json runtime.transport "framed"): every message is
// kind:u8 | length:u32 big-endian | payload. Kind 0 is a UTF-8 JSON-RPC message;
// kind 1 is channelLength:u16 big-endian | channel | bytes.
const FRAME_JSON = 0;
const FRAME_BINARY = 1;
export const MAX_BINARY_BYTES = 8 * 1024 * 1024;
const MAX_JSON_FRAME_BYTES = 1_048_576;
// features.largeStorage: a host.storage.set request or a host reply carrying a
// full 4 MiB storage value. Mirrors pluginRPCMaxStorageMessage on the host.
export const LARGE_STORAGE_MESSAGE_BYTES = 4 * 1024 * 1024 + 64 * 1024;
const CHANNEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function encodeFrame(kind, payload) {
  const header = Buffer.alloc(5);
  header.writeUInt8(kind, 0);
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

export function encodeBinaryFrame(channel, data) {
  if (typeof channel !== 'string' || !CHANNEL_PATTERN.test(channel)) throw new TypeError('Invalid binary channel');
  const bytes = Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data ?? []);
  if (bytes.length > MAX_BINARY_BYTES) throw new RangeError(`Binary payload exceeds ${MAX_BINARY_BYTES} bytes; chunk the transfer`);
  const name = Buffer.from(channel);
  const prefix = Buffer.alloc(2);
  prefix.writeUInt16BE(name.length, 0);
  return encodeFrame(FRAME_BINARY, Buffer.concat([prefix, name, bytes]));
}

// Returns a 'data' listener that reassembles frames and calls onFrame(kind, payload).
// maxJsonBytes() is read per frame, so a limit raised by negotiation applies at once.
export function createFrameReader(onFrame, onError, { maxJsonBytes = () => MAX_JSON_FRAME_BYTES } = {}) {
  let buffered = Buffer.alloc(0);
  let failed = false;
  return chunk => {
    if (failed) return;
    buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;
    while (buffered.length >= 5) {
      const kind = buffered.readUInt8(0);
      const length = buffered.readUInt32BE(1);
      const limit = kind === FRAME_JSON ? maxJsonBytes() - 1 : kind === FRAME_BINARY ? 2 + 128 + MAX_BINARY_BYTES : -1;
      if (length > limit || (kind === FRAME_BINARY && length < 2)) { failed = true; onError(new Error('frame kind or length is invalid')); return; }
      if (buffered.length < 5 + length) return;
      const payload = buffered.subarray(5, 5 + length);
      buffered = buffered.subarray(5 + length);
      if (kind === FRAME_BINARY) {
        const channelLength = payload.readUInt16BE(0);
        if (2 + channelLength > payload.length || !CHANNEL_PATTERN.test(payload.subarray(2, 2 + channelLength).toString('utf8'))) {
          failed = true; onError(new Error('binary frame channel is invalid')); return;
        }
      }
      onFrame(kind, payload);
    }
  };
}

// Manifest API v2, runtime protocol v1. stdout is reserved for JSON-RPC.
export function start(createActions, {
  adaptHost = host => host,
  maxResultBytes = 900_000,
  oversizedMessage = '结果过大，请清理日志后重试',
  cleanup = true,
  hostTimeoutMs = 25_000,
  formatResult = result => result,
  allowNullPayload = false,
  strictPayloadString = false,
  errors = {},
  validateInitialize,
  // Called with (keys, { host }) after the user changed settings or switched to
  // a workspace with different overrides. Providing it negotiates
  // features.configuration = 1; the host waits at most 3 seconds for the ack.
  onConfigurationChanged,
  // Host events: called with (event, data, { host }) for each plugin.event after
  // the host got its ack. `events` (a subset of HOST_EVENTS) is subscribed right
  // after initialize; events carrying paths need the workspace.read capability.
  // Events reach only a running plugin and never start one.
  onEvent,
  events,
  // { id, version? } reported in the initialize result so the host can reject
  // an entry that belongs to another plugin. Keep it equal to plugin.json.
  plugin,
  // plugin.call methods the plugin's views call directly with
  // transport.request(method, params): { name: (params, { host, sendBinary }) => result }.
  // View-only: no risk confirmation and never offered to AI; keep writes in actions.
  methods = {},
  // Must match plugin.json runtime.transport: 'jsonl' (default) or 'framed',
  // which also carries binary frames (onBinary / sendBinary).
  transport = 'jsonl',
  // Called with (channel, bytes, { host, sendBinary }) for each binary frame a view sent.
  onBinary,
  // Free-form view messages, like VS Code's webview postMessage: called with
  // (message, { viewId, host, postUIMessage, sendBinary }) for each message a
  // view posted with transport.postMessage, one at a time in arrival order.
  // Reply with postUIMessage. No risk confirmation and never offered to AI.
  onUIMessage,
  // Concurrency. Actions run one at a time by default (maxInflight 1, shared
  // with task starts): handlers that were never audited for concurrency keep
  // their serial behaviour. maxInflight raises that gate for every action;
  // concurrentActions names read-only actions (no shared mutable state) that
  // bypass it, bounded by maxConcurrent. Excess calls get -32029 busy.
  maxInflight = 1,
  concurrentActions = [],
  maxConcurrent = 16,
  // 'shared' (default): task starts take the same gate as invokes. 'separate':
  // tasks have their own limit (maxRunningTasks) and never block invokes.
  taskGate = 'shared',
  maxRunningTasks = 2,
  // When positive, an invoke that finds the gate full waits up to busyWaitMs
  // (first come, first served; at most maxQueued waiting) instead of failing
  // with busy at once. Task starts never wait.
  busyWaitMs = 0,
  maxQueued = 16,
  // features.taskEvents: when the host offers it, announce task changes with
  // plugin.task.changed notifications (progress at most every
  // taskEventIntervalMs, terminal states at once). false keeps polling only.
  taskEvents = true,
  taskEventIntervalMs = 100,
  // features.largeStorage: when the host offers it, storage values up to 4 MiB
  // may be read and written (host replies and host.storage.set requests up to
  // LARGE_STORAGE_MESSAGE_BYTES). Hosts without it keep every message within
  // 1 MiB. createStorageAPI still applies its own maxValueBytes.
  largeStorage = false,
} = {}) {
  if (transport !== 'jsonl' && transport !== 'framed') throw new TypeError("transport must be 'jsonl' or 'framed'");
  if (onBinary !== undefined && typeof onBinary !== 'function') throw new TypeError('onBinary must be a function');
  if (onUIMessage !== undefined && typeof onUIMessage !== 'function') throw new TypeError('onUIMessage must be a function');
  if (!methods || typeof methods !== 'object') throw new TypeError('methods must be an object');
  const positiveInteger = (value, name) => { if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`); };
  positiveInteger(maxInflight, 'maxInflight'); positiveInteger(maxConcurrent, 'maxConcurrent');
  positiveInteger(maxRunningTasks, 'maxRunningTasks'); positiveInteger(maxQueued, 'maxQueued');
  positiveInteger(taskEventIntervalMs, 'taskEventIntervalMs');
  if (!Number.isSafeInteger(busyWaitMs) || busyWaitMs < 0) throw new TypeError('busyWaitMs must be a non-negative integer');
  if (taskGate !== 'shared' && taskGate !== 'separate') throw new TypeError("taskGate must be 'shared' or 'separate'");
  if (!Array.isArray(concurrentActions) || concurrentActions.some(name => typeof name !== 'string' || !name)) throw new TypeError('concurrentActions must be an array of action names');
  if (typeof taskEvents !== 'boolean') throw new TypeError('taskEvents must be a boolean');
  if (typeof largeStorage !== 'boolean') throw new TypeError('largeStorage must be a boolean');
  const concurrentSet = new Set(concurrentActions);
  if (plugin !== undefined && (typeof plugin?.id !== 'string' || !plugin.id || (plugin.version !== undefined && typeof plugin.version !== 'string'))) throw new TypeError('plugin must be { id, version? }');
  if (onConfigurationChanged !== undefined && typeof onConfigurationChanged !== 'function') throw new TypeError('onConfigurationChanged must be a function');
  if (onEvent !== undefined && typeof onEvent !== 'function') throw new TypeError('onEvent must be a function');
  const subscribedEvents = events === undefined ? [] : validateHostEvents(events);
  if (subscribedEvents.length && !onEvent) throw new TypeError('events requires onEvent');
  const rpcError = (message, code, data) => Object.assign(new Error(message), { code, data });
  const pending = new Map();
  let sequence = 0;
  let stopped = false;
  let initialized = !validateInitialize;
  const framed = transport === 'framed';
  const writeText = (text, limit = maxResultBytes) => {
    if (Buffer.byteLength(text) > limit) throw new Error(oversizedMessage);
    process.stdout.write(framed ? encodeFrame(FRAME_JSON, Buffer.from(text)) : text + '\n');
  };
  const send = message => writeText(JSON.stringify({ jsonrpc: '2.0', ...message }));
  const sendBinary = (channel, data) => {
    if (!framed) throw new Error("sendBinary requires transport: 'framed' (and runtime.transport \"framed\" in plugin.json)");
    if (stopped) throw pluginError('HOST_CLOSED', '插件已停止', { retryable: true });
    process.stdout.write(encodeBinaryFrame(channel, data));
  };
  // postUIMessage(message, { viewId }) sends a JSON value to the plugin's open
  // views (host.ui.postMessage notification; needs the ui capability). Without
  // viewId every open view receives it. Views get messages in posting order.
  const postUIMessage = (message, { viewId = '' } = {}) => {
    if (stopped) throw pluginError('HOST_CLOSED', '插件已停止', { retryable: true });
    if (typeof viewId !== 'string' || (viewId && !UI_VIEW_ID_PATTERN.test(viewId))) throw pluginError('INVALID_UI_MESSAGE', 'viewId 必须是清单中的视图 ID');
    let json;
    try { json = JSON.stringify(message); } catch { json = undefined; }
    if (json === undefined || json === 'null') throw pluginError('INVALID_UI_MESSAGE', '消息必须是可序列化为 JSON 的非空值');
    if (Buffer.byteLength(json) > MAX_UI_MESSAGE_BYTES) throw pluginError('UI_MESSAGE_TOO_LARGE', '消息超过 256 KiB');
    send({ method: 'host.ui.postMessage', params: { message: JSON.parse(json), ...(viewId ? { viewId } : {}) } });
  };
  let uiMessageQueue = Promise.resolve();
  // `options.timeoutMs` overrides hostTimeoutMs for one call; use it for host
  // methods that wait for the user (host.quickPick / inputBox / plugins.invoke:
  // their own timeoutMs plus a margin).
  const host = (method, params, options = {}) => new Promise((resolve, reject) => {
    if (stopped) { reject(pluginError('HOST_CLOSED', '插件已停止', { retryable: true })); return; }
    const id = `host-${++sequence}`;
    const wait = Number.isSafeInteger(options?.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : hostTimeoutMs;
    const timer = setTimeout(() => { pending.delete(id); reject(pluginError('HOST_TIMEOUT', errors.timeout ?? '宿主请求超时', { retryable: true })); }, wait);
    pending.set(id, { resolve, reject, timer });
    try {
      // A negotiated host.storage.set may carry a value above maxResultBytes.
      const limit = largeStorageNegotiated && method === 'host.storage.set' ? Math.max(maxResultBytes, LARGE_STORAGE_MESSAGE_BYTES - 1) : maxResultBytes;
      writeText(JSON.stringify({ jsonrpc: '2.0', id, method, params }), limit);
    }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
  const adaptedHost = adaptHost(host);
  const actions = createActions(adaptedHost);
  // Both shutdown and stdin EOF can fire; cleanup must run only once.
  let disposal;
  const dispose = () => disposal ??= Promise.resolve().then(() => {
    if (cleanup) return actions.dispose?.();
  });
  // Slots: 'gate' (maxInflight, shared by tasks unless taskGate is 'separate'),
  // 'concurrent' (concurrentActions) and 'task' (taskGate 'separate').
  let inflight = 0, concurrentInflight = 0, runningTasks = 0;
  const waiters = [];
  const busyError = () => Object.assign(new Error(errors.busy ?? '已有任务运行，请稍后重试'), { code: -32029 });
  const acquire = slot => { if (slot === 'concurrent') concurrentInflight++; else if (slot === 'task') runningTasks++; else inflight++; };
  const release = slot => {
    if (slot === 'concurrent') { concurrentInflight--; return; }
    if (slot === 'task') { runningTasks--; return; }
    const next = waiters.shift();
    // Hand the gate straight to the oldest waiting invoke.
    if (next && !stopped) { clearTimeout(next.timer); next.resolve(true); return; }
    if (next) { clearTimeout(next.timer); next.resolve(false); }
    inflight--;
  };
  const waitForGate = () => new Promise(resolve => {
    const waiter = { resolve, timer: setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      resolve(false);
    }, busyWaitMs) };
    waiters.push(waiter);
  });
  let tasksNegotiated = false;
  let taskEventsNegotiated = false;
  let configurationNegotiated = false;
  let largeStorageNegotiated = false;
  // `initialized` is true up front without validateInitialize; events wait for the real handshake.
  let eventsReady = false;
    const tasks = new Map();
    const snapshot = task => ({ taskId: task.taskId, state: task.state, cancelRequested: task.cancelRequested, progress: task.progress, result: task.result, error: task.error });
  // plugin.task.changed is a hint only: the host then reads plugin.task.status.
  const notifyTask = (task, terminal) => {
    if (!taskEventsNegotiated || stopped) return;
    if (!terminal) {
      if (task.eventTimer) return;
      const wait = taskEventIntervalMs - (Date.now() - (task.lastEvent ?? 0));
      if (wait > 0) {
        task.eventTimer = setTimeout(() => { task.eventTimer = null; if (task.state === 'running') notifyTask(task, false); }, wait);
        task.eventTimer.unref?.();
        return;
      }
    } else if (task.eventTimer) { clearTimeout(task.eventTimer); task.eventTimer = null; }
    task.lastEvent = Date.now();
    try { send({ method: 'plugin.task.changed', params: { taskId: task.taskId } }); }
    catch { process.stderr.write('Plugin task notification failed\n'); }
  };
  const input = framed ? null : readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const stop = () => {
    if (stopped) return;
    stopped = true;
        for (const task of tasks.values()) { clearTimeout(task.timer); clearTimeout(task.eventTimer); task.controller.abort(); }
    for (const waiter of waiters.splice(0)) { clearTimeout(waiter.timer); waiter.resolve(false); }
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(pluginError('HOST_CLOSED', '宿主连接关闭', { retryable: true })); }
    pending.clear();
    input?.close();
    process.stdin.destroy();
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    dispose().catch(() => { process.stderr.write('Plugin cleanup failed\n'); });
  };
  // JSON-RPC 2.0: one message or a batch (an array) per line. Unparsable input
  // gets -32700 and anything that is not a valid request -32600, both with id
  // null unless a valid id can be read (§5.1); a batch is answered with one
  // array holding the replies of its requests, or nothing at all (§6).
  const handleMessage = async line => {
    if (stopped) return;
    let parsed;
    try {
      if (Buffer.byteLength(line) > (largeStorageNegotiated ? LARGE_STORAGE_MESSAGE_BYTES : MAX_JSON_FRAME_BYTES)) { send(protocolError(null, -32600)); return; }
      parsed = JSON.parse(line);
    } catch {
      try { send(protocolError(null, -32700)); } catch { process.stderr.write('Invalid plugin RPC request\n'); }
      return;
    }
    if (!Array.isArray(parsed)) { await handleOne(parsed, send); return; }
    if (parsed.length === 0) { send(protocolError(null, -32600)); return; }
    const replies = [];
    await Promise.all(parsed.map(item => handleOne(item, reply => { replies.push({ jsonrpc: '2.0', ...reply }); })));
    // Written even after a batched plugin.shutdown stopped the runtime: its reply must go out.
    if (!replies.length) return;
    try { writeText(JSON.stringify(replies)); }
    catch {
      try { writeText(JSON.stringify(replies.map(reply => ({ jsonrpc: '2.0', id: reply.id, error: { code: -32603, message: oversizedMessage } })))); }
      catch { process.stderr.write('Plugin RPC response failed\n'); }
    }
  };
  const handleOne = async (request, send) => {
    if (stopped) return;
    try {
      if (!request || typeof request !== 'object' || Array.isArray(request)) { send(protocolError(null, -32600)); return; }
      // Without a method it is a (possibly malformed) response and never answered:
      // an error echoing its id could be taken by the host as a reply to its own call.
      if (!request.method) {
        const waiting = pending.get(request.id);
        if (waiting) {
          pending.delete(request.id); clearTimeout(waiting.timer);
          if (request.error) waiting.reject(rpcError(request.error.message, request.error.code, request.error.data));
          else waiting.resolve(request.result);
        }
        return;
      }
      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string' || !request.method
        || (request.id !== undefined && !validRequestId(request.id))
        || (request.params !== undefined && (request.params === null || typeof request.params !== 'object'))) {
        send(protocolError(validRequestId(request.id) ? request.id : null, -32600)); return;
      }
      if (request.id === undefined) return;
      if (request.method === 'plugin.initialize') {
        // Validation is synchronous so a following invoke cannot race initialization.
        const extra = validateInitialize?.(request.params);
        initialized = true;
        tasksNegotiated = request.params?.features?.tasks === 1;
        taskEventsNegotiated = tasksNegotiated && taskEvents && request.params?.features?.taskEvents === 1;
        configurationNegotiated = Boolean(onConfigurationChanged) && request.params?.features?.configuration === 1;
        largeStorageNegotiated = largeStorage && request.params?.features?.largeStorage === 1;
        eventsReady = true;
        const features = { ...(tasksNegotiated ? { tasks: 1 } : {}), ...(taskEventsNegotiated ? { taskEvents: 1 } : {}), ...(configurationNegotiated ? { configuration: 1 } : {}), ...(largeStorageNegotiated ? { largeStorage: 1 } : {}) };
        send({ id: request.id, result: { ...extra, runtimeProtocolVersion: 1, ...(Object.keys(features).length ? { features } : {}), ...(plugin ? { plugin: { id: plugin.id, ...(plugin.version ? { version: plugin.version } : {}) } } : {}) } });
        if (subscribedEvents.length) {
          host('host.events.subscribe', { events: subscribedEvents })
            .catch(() => { process.stderr.write('Plugin event subscription failed\n'); });
        }
        return;
      }
      if (request.method === 'plugin.ping') {
        send({ id: request.id, result: { runtimeProtocolVersion: 1 } }); return;
      }
      if (request.method === 'plugin.event') {
        if (!eventsReady || !onEvent) throw rpcError('Host events were not subscribed', -32601);
        const event = request.params?.event;
        if (typeof event !== 'string' || !HOST_EVENTS.includes(event)) throw rpcError('Unknown host event', -32602);
        // Acknowledge first: the host waits briefly and never for the handler.
        send({ id: request.id, result: {} });
        Promise.resolve().then(() => onEvent(event, request.params?.data ?? null, { host: adaptedHost }))
          .catch(() => { process.stderr.write('Plugin event handler failed\n'); });
        return;
      }
      if (request.method === 'plugin.configuration.changed') {
        if (!initialized || !configurationNegotiated) throw rpcError('Configuration notifications were not negotiated', -32601);
        const keys = Array.isArray(request.params?.keys) ? request.params.keys.filter(key => typeof key === 'string') : [];
        // Acknowledge first: the host only waits briefly and never for the handler.
        send({ id: request.id, result: {} });
        Promise.resolve().then(() => onConfigurationChanged(keys, { host: adaptedHost }))
          .catch(() => { process.stderr.write('Plugin configuration change handler failed\n'); });
        return;
      }
      if (request.method === 'plugin.ui.message') {
        if (!initialized) throw new Error('Plugin is not initialized');
        if (!onUIMessage) throw rpcError('View messages are not handled', -32601);
        const message = request.params?.message;
        if (message === undefined || message === null) throw rpcError('Invalid view message parameters', -32602);
        const viewId = typeof request.params?.viewId === 'string' ? request.params.viewId : '';
        // Acknowledge first; handlers run one at a time so messages keep their order.
        send({ id: request.id, result: {} });
        uiMessageQueue = uiMessageQueue.then(() => onUIMessage(message, { viewId, host: adaptedHost, postUIMessage, sendBinary }))
          .catch(() => { process.stderr.write('Plugin view message handler failed\n'); });
        return;
      }
      if (request.method === 'plugin.call') {
        if (!initialized) throw new Error('Plugin is not initialized');
        const name = request.params?.method;
        if (typeof name !== 'string' || !name) throw rpcError('Invalid call parameters', -32602);
        const method = Object.hasOwn(methods, name) ? methods[name] : undefined;
        if (typeof method !== 'function') throw rpcError('Unknown method', -32601);
        // Calls may overlap; the host bounds them per view.
        const result = await method(request.params?.params ?? null, { host: adaptedHost, sendBinary });
        if (!stopped) send({ id: request.id, result: formatResult(result) ?? null });
        return;
      }
      if (request.method === 'plugin.shutdown') {
        stop();
        await dispose();
        send({ id: request.id, result: {} });
        process.exitCode = 0; return;
      }
      const taskMethod = request.method.startsWith('plugin.task.');
            if (taskMethod && (!initialized || !tasksNegotiated)) throw rpcError('Tasks were not negotiated', -32601);
            if (taskMethod) {
              for (const [id, task] of tasks) if (task.finished && Date.now() - task.finished > 300_000) tasks.delete(id);
              if (request.method === 'plugin.task.status' || request.method === 'plugin.task.cancel') {
                const task = tasks.get(request.params?.taskId);
                if (!task) throw rpcError('Task not found', -32602);
                if (request.method === 'plugin.task.cancel' && task.state === 'running') {
                  task.cancelRequested = true;
                  task.controller.abort();
                }
                send({ id: request.id, result: snapshot(task) }); return;
              }
            }
            if (request.method !== 'plugin.invoke' && request.method !== 'plugin.task.start') throw rpcError('不支持的方法', -32601);
      if (!initialized) throw new Error('Plugin is not initialized');
      // 保留错误码 -32029：宿主桥接映射为 "busy"，共享 transport 据此退避重试。
      // As before, the gate is checked from the action name before any other validation.
      const isTaskStart = request.method === 'plugin.task.start';
      const actionName = request.params?.action;
      let slot = 'gate', waitForSlot = false;
      if (typeof actionName === 'string' && concurrentSet.has(actionName)) {
        if (concurrentInflight >= maxConcurrent) throw busyError();
        slot = 'concurrent';
      } else if (isTaskStart && taskGate === 'separate') {
        if (runningTasks >= maxRunningTasks) throw busyError();
        slot = 'task';
      } else if (inflight >= maxInflight) {
        if (isTaskStart || busyWaitMs === 0 || waiters.length >= maxQueued) throw busyError();
        waitForSlot = true;
      }
      const action = actions[request.params?.action];
      if (typeof action !== 'function' || !Object.hasOwn(actions, request.params.action) || (cleanup && request.params.action === 'dispose')) throw rpcError('不支持的操作', -32601);
      const raw = request.params?.payload;
      if (strictPayloadString && raw !== undefined && typeof raw !== 'string') {
        throw rpcError('Payload must be a JSON string', -32602);
      }
      let payload;
      try { payload = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw ?? {}); }
      catch { throw rpcError('Payload must contain valid JSON', -32602); }
      if (allowNullPayload && payload === null) payload = {};
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw rpcError('参数必须是对象', -32602);
      if (request.method === 'plugin.task.start') {
        const taskId = request.params?.taskId;
        if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(taskId) || tasks.has(taskId)) throw rpcError('Invalid or duplicate task ID', -32602);
        if (tasks.size >= 64) throw new Error('Task count limit reached');
        const task = { taskId, state: 'running', cancelRequested: false, controller: new AbortController() };
        tasks.set(taskId, task);
        acquire(slot);
        const timer = setTimeout(() => { task.cancelRequested = true; task.controller.abort(); notifyTask(task, false); }, 300_000);
        task.timer = timer;
                const taskContext = {
          signal: task.controller.signal,
          reportProgress(value) {
            if (stopped || task.state !== 'running') return;
            const serialized = JSON.stringify(value);
            if (serialized === undefined || Buffer.byteLength(serialized) > 4096) throw new Error('Task progress exceeds limit');
            task.progress = JSON.parse(serialized);
            notifyTask(task, false);
          },
        };
        try { send({ id: request.id, result: snapshot(task) }); }
        catch (error) {
          // No action has started; a failed acknowledgement must not reserve the gate or ID.
          clearTimeout(timer);
          tasks.delete(taskId);
          release(slot);
          task.controller.abort();
          throw error;
        }
        Promise.resolve().then(() => action(payload, taskContext)).then(result => {
          if (stopped) return;
          const serialized = JSON.stringify(formatResult(result) ?? null);
          if (Buffer.byteLength(serialized) > 262144) throw new Error('Task result exceeds limit');
          task.result = JSON.parse(serialized);
          task.state = 'succeeded';
        }).catch(error => {
          task.state = task.controller.signal.aborted && error?.name === 'AbortError' ? 'cancelled' : 'failed';
          task.error = String(error?.message ?? 'Task failed').slice(0, 1000);
        }).finally(() => {
          clearTimeout(timer); task.finished = Date.now(); release(slot);
          notifyTask(task, true);
          const expiry = setTimeout(() => tasks.delete(taskId), 300_000);
          expiry.unref();
        });
        return;
      }
      if (waitForSlot) {
        // release() hands the gate over; false means the wait timed out.
        if (!await waitForGate()) throw busyError();
      } else acquire(slot);
      try {
        const result = await action(payload);
        if (!stopped) send({ id: request.id, result: formatResult(result) });
      }
      finally { release(slot); }
    } catch (error) {
      // Shutdown owns its final reply; in-flight actions must stay silent after stop.
      if (stopped && request?.method !== 'plugin.shutdown') return;
      if (request?.id !== undefined) {
        try { send({ id: request.id, error: { code: Number.isInteger(error?.code) ? error.code : -32000, message: error instanceof Error ? error.message : '插件调用失败', data: safeErrorData(error) } }); }
        catch { process.stderr.write('Plugin RPC response failed\n'); stop(); }
      } else process.stderr.write('Invalid plugin RPC request\n');
    }
  };
  if (framed) {
    // Binary frames are handled in arrival order; JSON messages as they come.
    let binaryQueue = Promise.resolve();
    const onFrame = (kind, payload) => {
      if (kind === FRAME_JSON) { handleMessage(payload.toString('utf8')); return; }
      const channel = payload.subarray(2, 2 + payload.readUInt16BE(0)).toString('utf8');
      const data = payload.subarray(2 + channel.length);
      binaryQueue = binaryQueue.then(() => onBinary?.(channel, data, { host: adaptedHost, sendBinary }))
        .catch(() => { process.stderr.write('Plugin binary handler failed\n'); });
    };
    process.stdin.on('data', createFrameReader(onFrame, error => {
      process.stderr.write(`Invalid plugin frame: ${error.message}\n`);
      stop();
    }, { maxJsonBytes: () => largeStorageNegotiated ? LARGE_STORAGE_MESSAGE_BYTES : MAX_JSON_FRAME_BYTES }));
    process.stdin.on('end', stop);
  } else {
    input.on('line', handleMessage);
    input.on('close', stop);
  }
  process.stdin.on('error', stop);
  process.stdout.on('error', stop);
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return { sendBinary, postUIMessage };
}

// system.associations: inspect own declared handlers, request host settings,
// and read a host-bound file request (never an arbitrary filesystem path).
// A JSON-RPC 2.0 request id is a string, a finite number or null.
function validRequestId(id) {
  return id === null || typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
}

function protocolError(id, code) {
  return { id, error: { code, message: code === -32700 ? 'Parse error' : 'Invalid Request' } };
}

export function createAssociationsAPI(host) {
  return {
    list: () => host('host.associations.list', {}),
    request(handlerId) {
      if (typeof handlerId !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(handlerId)) throw pluginError('INVALID_ARGUMENT', 'Invalid handler id');
      return host('host.associations.request', { handlerId });
    },
    read(requestId, offset = 0, length = 65536) {
      if (typeof requestId !== 'string' || !/^[a-f0-9]{32}$/.test(requestId) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(length) || length < 1 || length > 65536) throw pluginError('INVALID_ARGUMENT', 'Invalid authorized file chunk');
      return host('host.associations.read', { requestId, offset, length });
    },
  };
}
