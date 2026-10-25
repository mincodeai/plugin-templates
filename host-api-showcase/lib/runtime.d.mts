// Type declarations for runtime.mjs (TypeScript pairs .mjs with .d.mts), the optional MinCode Node plugin SDK
// (manifest API v1/v2, runtime protocol v1). Keep in sync with runtime.mjs.

/** A host.* JSON-RPC call; rejects with an Error carrying the host `code` and optional `data`. */
/** `options.timeoutMs` overrides hostTimeoutMs for one call (for host methods that wait for the user). */
export type HostCall = (method: string, params?: unknown, options?: { timeoutMs?: number }) => Promise<any>;

export type FileInput = string | Uint8Array | ArrayBuffer;

export type HostEvent = 'workspace.changed' | 'workspace.rootChanged' | 'editor.activeFileChanged' | 'editor.fileSaved' | 'editor.selectionChanged' | 'git.headChanged' | 'ai.activity' | 'ai.tasks';

export type AIActivityPhase = 'queued' | 'thinking' | 'streaming' | 'tool_running' | 'waiting_approval' | 'waiting_input' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
export declare const HOST_EVENTS: readonly HostEvent[];

/** Payloads of plugin.event; paths are relative to the workspace root, null when outside it. */
export interface HostEventData {
  'workspace.changed': { workspaceId: string };
  'workspace.rootChanged': { root: string | null };
  'editor.activeFileChanged': { path: string | null };
  'editor.fileSaved': { path: string };
  'editor.selectionChanged': { path: string; selection: { startLine: number; startColumn: number; endLine: number; endColumn: number } };
  'git.headChanged': { branch?: string; detached: boolean; commit?: string };
  /**
   * Capability ai.activity: a snapshot of unfinished AI tasks (a run and its sub-agents count as one), numbered by seq;
   * keep only the highest seq, deliveries may arrive out of order. A phase change also names that run; periodic
   * snapshots (every minute while tasks are active, and once when the last ends) do not. No conversation content.
   */
  'ai.activity': { seq: number; runId?: string; source?: 'assistant' | 'agent'; phase?: AIActivityPhase; active: number; thinking: number; working: number; waiting: number };
  /**
   * Capability ai.tasks: the top-level AI tasks that are unfinished or finished within the last 10 minutes
   * (at most 20, newest first; title <= 80 and summary <= 160 characters), numbered by seq (keep the highest).
   * Sent shortly after any change and every minute while tasks are listed. No conversation content or identifiers.
   */
  'ai.tasks': { seq: number; tasks: { runId: string; source: 'assistant' | 'agent'; phase: AIActivityPhase; title: string; summary?: string; updatedAt: number }[] };
}

export declare class PluginError extends Error {
  constructor(code: string, message: string, options?: { data?: unknown; retryable?: boolean; cause?: unknown });
  readonly code: string;
  readonly retryable: boolean;
  readonly data?: unknown;
}
export declare function pluginError(code: string, message: string, options?: { data?: unknown; retryable?: boolean; cause?: unknown }): PluginError;

// ---- storage (capability `storage`) ----

export interface StorageFilesAPI {
  read(path: string, options?: { offset?: number; maxBytes?: number; onMissing?: 'null' }): Promise<Buffer | null>;
  read(path: string, options: { offset?: number; maxBytes?: number; onMissing: 'error' }): Promise<Buffer>;
  /** Whole-file replacements over 64 KiB are staged (atomic) on hosts that support it; otherwise sequential, non-atomic chunks. */
  write(path: string, value: FileInput, options?: { offset?: number; truncate?: boolean }): Promise<{ bytesWritten: number; offset: number }>;
  /** Atomically replaces the whole file; rejects with code UNSUPPORTED (file untouched) when a multi-chunk body meets a host without staged writes. */
  writeAtomic(path: string, value: FileInput): Promise<{ bytesWritten: number; offset: number }>;
  delete(path: string): Promise<unknown>;
  list(path?: string): Promise<string[]>;
  stat(path: string): Promise<{ size: number; modifiedAt: string } | null>;
}
/** maxChunkBytes: 1–524288 (default 524288; 64 KiB is used until the host reports staged-write support). */
export declare function createStorageFilesAPI(host: HostCall, options?: { maxChunkBytes?: number; maxFileBytes?: number }): StorageFilesAPI;

export interface StorageAPI {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  keys(): Promise<string[]>;
  files: StorageFilesAPI;
}
export declare function createStorageAPI(host: HostCall, options?: { maxValueBytes?: number; maxChunkBytes?: number; maxFileBytes?: number }): StorageAPI;

// ---- secrets (capability `secrets`) ----

export interface SecretsAPI {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  keys(): Promise<string[]>;
}
export declare function createSecretsAPI(host: HostCall): SecretsAPI;

// ---- commands, configuration, status bar ----

export declare function createContextAPI(host: HostCall): { set(key: string, value: string | number | boolean | null): Promise<unknown> };
export declare function createConfigurationAPI(host: HostCall): { get(keys?: string[]): Promise<Record<string, unknown>> };

export interface StatusBarFields {
  text?: string;
  tooltip?: string;
  severity?: 'normal' | 'warning' | 'error';
  busy?: boolean;
  visible?: boolean;
}
export declare function createStatusBarAPI(host: HostCall): {
  update(id: string, fields?: StatusBarFields): Promise<unknown>;
  reset(id?: string): Promise<unknown>;
};

// ---- shell (capability `shell`) ----

export interface ShellResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exit_code: number;
}
export declare function quoteShellArgument(value: unknown): string;
export declare function createShellAPI(host: HostCall, options?: { maxOutputBytes?: number }): {
  run(command: string, options?: { cwd?: string; seconds?: number }): Promise<ShellResult>;
  exec(args: string[], options?: { cwd?: string; stdin?: string; seconds?: number }): Promise<string>;
};

// ---- clipboard, notifications, AI, host ----

export declare function createClipboardAPI(host: HostCall): {
  read(options?: { since?: number }): Promise<{ changed: boolean; seq: number; text: string; concealed: boolean; truncated: boolean }>;
  write(text: string): Promise<unknown>;
};

export declare function createNotificationsAPI(host: HostCall): {
  notify(notification: { title: string; body?: string; level?: 'info' | 'success' | 'warning' | 'error'; system?: boolean; viewId?: string }): Promise<unknown>;
};

export interface AITurnRequest {
  conversationKey: string;
  conversationId?: string;
  title?: string;
  sender?: string;
  prompt: string;
  instructions?: string;
  allowedPlugins: string[];
  maxRisk?: string;
  chatApproval?: boolean;
  workspaceAccess?: boolean;
}
export interface AITurnState {
  id: string;
  status: string;
  done: boolean;
  text: string;
  activity?: string;
  error?: string;
  conversationId?: string;
  approval?: { id: string; summary: string; risk: string; tool: string };
}
export declare function createAIAPI(host: HostCall): {
  plugins(): Promise<Array<{ id: string; name: string; description?: string; enabled: boolean; actions: string[] }>>;
  grants(): Promise<{ chatApproval: boolean; workspaceAccess: boolean }>;
  start(request: AITurnRequest): Promise<AITurnState>;
  poll(turnId: string): Promise<AITurnState>;
  cancel(turnId: string): Promise<AITurnState>;
  approve(turnId: string, approvalId: string, approved: boolean): Promise<AITurnState>;
};

export interface HostDescription {
  apiVersion: number;
  runtimeProtocolVersion: number;
  methods: Array<{ name: string; capability?: string; available: boolean }>;
  events: Array<{ name: HostEvent; capability?: string; available: boolean }>;
  features: Record<string, number>;
  limits: Record<string, number>;
}
export declare function createHostAPI(host: HostCall): {
  info(): Promise<{ name: string; runtimeProtocolVersion: number; manifestApiVersion: number; platform: string }>;
  describe(): Promise<HostDescription>;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): Promise<unknown>;
};

// ---- workspace files (capabilities `workspace.read` / `workspace.write`) ----

export interface WorkspaceEntry {
  path: string;
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  size: number;
  modifiedAt: number;
  sha256?: string;
}
export interface WorkspaceChunk {
  bytes: Buffer;
  offset: number;
  nextOffset: number;
  eof: boolean;
  size: number;
  modifiedAt: number;
}
/** Errors are PluginError with code NO_WORKSPACE, FILE_NOT_FOUND, PERMISSION_DENIED, CONFLICT, PAYLOAD_TOO_LARGE, NOT_A_FILE, NOT_A_DIRECTORY or INVALID_ARGUMENT. */
export interface WorkspaceAPI {
  root(): Promise<string | null>;
  list(path?: string): Promise<{ path: string; entries: WorkspaceEntry[]; truncated: boolean }>;
  stat(path: string, options?: { sha256?: boolean }): Promise<WorkspaceEntry>;
  readChunk(path: string, options?: { offset?: number; maxBytes?: number }): Promise<WorkspaceChunk>;
  read(path: string, options?: { maxBytes?: number }): Promise<Buffer>;
  readText(path: string, options?: { maxBytes?: number }): Promise<string>;
  write(path: string, value: FileInput, options?: { expectedSha256?: string; createOnly?: boolean; createParents?: boolean }): Promise<{ path: string; size: number; sha256: string; created: boolean }>;
}
export declare function createWorkspaceAPI(host: HostCall, options?: { maxFileBytes?: number }): WorkspaceAPI;

export declare function createEventsAPI(host: HostCall): { subscribe(events: HostEvent[]): Promise<{ events: HostEvent[] }> };

// ---- runtime ----

export interface TaskContext {
  signal: AbortSignal;
  reportProgress(value: unknown): void;
}
export type Action = (payload: Record<string, unknown>, task?: TaskContext) => unknown;
export type Actions = Record<string, Action> & { dispose?: () => unknown };

export interface StartOptions<H = HostCall> {
  adaptHost?: (host: HostCall) => H;
  maxResultBytes?: number;
  oversizedMessage?: string;
  /**
   * Opt in to features.largeStorage: when the host offers it, storage values up to
   * 4 MiB can be read and written. Hosts without it keep messages within 1 MiB.
   */
  largeStorage?: boolean;
  cleanup?: boolean;
  hostTimeoutMs?: number;
  formatResult?: (result: unknown) => unknown;
  allowNullPayload?: boolean;
  strictPayloadString?: boolean;
  errors?: { timeout?: string; busy?: string };
  validateInitialize?: (params: unknown) => Record<string, unknown> | void;
  onConfigurationChanged?: (keys: string[], context: { host: H }) => unknown;
  /** Subscribed right after initialize; requires onEvent. */
  events?: HostEvent[];
  onEvent?: <E extends HostEvent>(event: E, data: HostEventData[E], context: { host: H }) => unknown;
  /** Reported in the initialize result so the host can reject an entry of another plugin; keep equal to plugin.json. */
  plugin?: { id: string; version?: string };
  /** plugin.call methods views call with transport.request(method, params). View-only: no risk confirmation, never offered to AI. */
  methods?: Record<string, PluginMethod<H>>;
  /** Must match plugin.json runtime.transport. "framed" also carries binary frames. */
  transport?: "jsonl" | "framed";
  /** Binary frames sent by views (framed transport), delivered in order. */
  onBinary?: (channel: string, data: Buffer, context: PluginCallContext<H>) => unknown;
  /**
   * Free-form messages views posted with transport.postMessage (like VS Code's webview postMessage),
   * one at a time in arrival order. viewId is the sending view's manifest ID. No risk confirmation, never offered to AI.
   */
  onUIMessage?: (message: unknown, context: UIMessageContext<H>) => unknown;
  /** Actions (and, with taskGate "shared", task starts) running at once outside concurrentActions; default 1. Excess calls get -32029 busy. */
  maxInflight?: number;
  /** Read-only actions without shared mutable state that bypass the maxInflight gate; list only audited handlers. */
  concurrentActions?: string[];
  /** Bound for concurrently running concurrentActions; default 16. */
  maxConcurrent?: number;
  /** "shared" (default): task starts take the invoke gate. "separate": tasks are bounded by maxRunningTasks and never block invokes. */
  taskGate?: "shared" | "separate";
  /** Running tasks with taskGate "separate"; default 2. */
  maxRunningTasks?: number;
  /** When positive, an invoke finding the gate full waits up to this long for a slot instead of failing busy at once; task starts never wait. Default 0. */
  busyWaitMs?: number;
  /** Invokes allowed to wait under busyWaitMs; default 16. */
  maxQueued?: number;
  /** Negotiate features.taskEvents when offered and send plugin.task.changed notifications; default true. */
  taskEvents?: boolean;
  /** Minimum gap between progress notifications of one task; default 100 ms. Terminal states are announced at once. */
  taskEventIntervalMs?: number;
}
export type SendBinary = (channel: string, data: Uint8Array | ArrayBuffer) => void;
export interface PluginCallContext<H = HostCall> {
  host: H;
  /** Sends one binary frame (at most MAX_BINARY_BYTES) to the plugin's open views; framed transport only. */
  sendBinary: SendBinary;
}
/**
 * Sends a JSON value (at most 256 KiB) to the plugin's open views as a host.ui.postMessage notification;
 * needs the ui capability. Without viewId every open view receives it. Throws INVALID_UI_MESSAGE or UI_MESSAGE_TOO_LARGE.
 */
export type PostUIMessage = (message: unknown, options?: { viewId?: string }) => void;
export interface UIMessageContext<H = HostCall> extends PluginCallContext<H> {
  viewId: string;
  postUIMessage: PostUIMessage;
}
export type PluginMethod<H = HostCall> = (params: unknown, context: PluginCallContext<H>) => unknown;
export declare const MAX_BINARY_BYTES: number;
export declare function encodeBinaryFrame(channel: string, data: Uint8Array | ArrayBuffer): Buffer;
export declare function createFrameReader(onFrame: (kind: number, payload: Buffer) => void, onError: (error: Error) => void, options?: { maxJsonBytes?: () => number }): (chunk: Buffer) => void;
/** Message limit after features.largeStorage: a full 4 MiB storage value plus its envelope. */
export declare const LARGE_STORAGE_MESSAGE_BYTES: number;
export declare function start<H = HostCall>(createActions: (host: H) => Actions, options?: StartOptions<H>): { sendBinary: SendBinary; postUIMessage: PostUIMessage };

export interface Association {
  handlerId: string; type: string; enabled: boolean; defaultPlugin: boolean;
  system: { supported: boolean; default: boolean; application: string; manual: boolean };
}
export declare function createAssociationsAPI(host: HostCall): {
  list(): Promise<{ handlers: Association[] }>;
  request(handlerId: string): Promise<{ requested: boolean }>;
  read(requestId: string, offset?: number, length?: number): Promise<{ data: string; size: number; eof: boolean }>;
};
