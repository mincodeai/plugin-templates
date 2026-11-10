// Type declarations for runtime.mjs (TypeScript pairs .mjs with .d.mts), the optional MinCode Node plugin SDK
// (manifest API v1/v2, runtime protocol v1). Keep in sync with runtime.mjs.

/** A host.* JSON-RPC call; rejects with an Error carrying the host `code` and optional `data`. */
/** `options.timeoutMs` overrides hostTimeoutMs for one call (for host methods that wait for the user). */
export type HostCall = (method: string, params?: unknown, options?: { timeoutMs?: number }) => Promise<any>;

export type FileInput = string | Uint8Array | ArrayBuffer;

export type HostEvent = 'workspace.changed' | 'workspace.rootChanged' | 'editor.activeFileChanged' | 'editor.fileSaved' | 'editor.selectionChanged' | 'git.headChanged' | 'ai.activity' | 'ai.tasks' | 'workspace.fileCreated' | 'workspace.fileDeleted' | 'workspace.fileRenamed' | 'workspace.rescanRequired' | 'git.statusChanged' | 'app.lockChanged' | 'app.suspend' | 'app.resume' | 'tests.runEnded';

/** Canonical decimal strings are opaque host-owned identities, not JS numbers. */
export interface SearchFileScope { workspaceId: string; root: string; revision: string }
export interface ProviderRuntime { instance: string; generation: string }
export interface SearchProviderPayload { provider: string; query: string; locale: string; project?: { name: string; root: string } }
/** Provider results contain targets only; never invent fileScope/providerRuntime. Paths are clean root-relative slash paths; line/column are 1-based (column requires line). */
export type SearchResultArgs = Record<string, string | number | boolean>;
export type SearchResultTarget = { type: 'view'; view: string; args?: SearchResultArgs } | { type: 'command'; command: string; args?: SearchResultArgs } | { type: 'url'; url: string } | { type: 'file'; path: string; line?: number; column?: number };
export interface SearchResultItem { id: string; title: string; detail?: string; target: SearchResultTarget }
/** Host-normalized response. Scope and runtime are present only for file-enabled queries. */
export interface SearchResponse { items: SearchResultItem[]; dropped: number; truncated: boolean; fileScope?: SearchFileScope; providerRuntime?: ProviderRuntime }
export interface WorkspaceFileBatch { scopeRevision: string; origin: 'host' | 'watcher'; rescanRequired: boolean }
export type WorkspaceRescanReason = 'overflow' | 'truncated' | 'sourceLost' | 'deliveryLost';

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
  /** workspace.read; availability is described independently from runtime features. */
  'workspace.fileCreated': WorkspaceFileBatch & { paths: string[] };
  'workspace.fileDeleted': WorkspaceFileBatch & { paths: string[] };
  'workspace.fileRenamed': WorkspaceFileBatch & { renames: { oldPath: string; newPath: string }[] };
  'workspace.rescanRequired': { scopeRevision: string; reason: WorkspaceRescanReason };
  'git.statusChanged': { scopeRevision: string; staged: number; unstaged: number; untracked: number; conflicted: number };
  /** A notification only, not authorization or an unlock API. */
  'app.lockChanged': { locked: boolean };
  /** Currently unavailable on native platforms; check describe.events, not VERSION. */
  'app.suspend': Record<string, never>;
  'app.resume': Record<string, never>;
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
  /**
   * workspace.read, host 0.3.0: the debug session of the plugin's streaming test run ended (see createTestsAPI).
   * Sent to the run's plugin only, whether or not it subscribed; stop listening and clean up.
   */
  'tests.runEnded': { runId: string; reason: string };
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

/**
 * File decorations (contributes.fileDecorations, capability `workspace.read`, host 0.3.0).
 * refresh() is a data-free hint: the project tree re-requests this plugin's decorations for
 * the directories it shows, at most once every 2 s per plugin. Resolves `{ scheduled: false }`
 * when rate limited, on hosts without the method, or when the plugin declares no fileDecorations.
 */
export declare function createDecorationsAPI(host: HostCall): {
  refresh(): Promise<{ scheduled: boolean }>;
};

/**
 * jdtls commands (contributes.jdtlsBundles, capability `shell`, host 0.3.0).
 * executeCommand sends workspace/executeCommand to the built-in Java language server running
 * for the absolute project folder `root` and resolves its result (null when none). Only commands
 * declared in the plugin's own jdtlsBundles are allowed (-32001); a jdtls that is not running or
 * was started without the plugin's confirmed jars rejects with -32000 "unavailable: ...". The host
 * waits at most 60 s and refuses results above 1 MiB (-32603). Rejects with code `UNSUPPORTED`
 * on hosts without the method or when the plugin declares no jdtlsBundles (-32601).
 */
export declare function createJdtlsAPI(host: HostCall): {
  executeCommand(request: { root: string; command: string; arguments?: unknown[] }): Promise<unknown>;
};

/** One generic test run event (see createTestsAPI). */
export type TestRunEvent =
  | { type: 'tree'; id: string; parentId?: string; label: string; kind: 'suite' | 'test'; path?: string; line?: number }
  | { type: 'started'; id: string }
  | { type: 'passed' | 'failed' | 'errored' | 'skipped'; id: string; durationMs?: number; message?: string; expected?: string; actual?: string; trace?: string }
  | { type: 'output'; id?: string; text: string }
  | { type: 'finished'; durationMs?: number };

export declare const TEST_PUBLISH_EVENTS_MAX: number;

/**
 * Streaming test runs (contributes.testProviders debugRun, capability `workspace.read`, host 0.3.0).
 * The host calls the provider's resolveRunAction with {provider, project: {root}, testIds, debug, runId};
 * publish reports result events of that live run (<= 500 events, 256 KiB per call, 200 calls/s, -32029 above;
 * an unknown, foreign or ended run rejects with -32001). Invalid events are dropped and counted. Message
 * <= 4096 characters; trace, expected, actual and output text <= 64 KiB; <= 10000 test ids per run. The
 * host event 'tests.runEnded' tells the plugin its session ended. Rejects with code `UNSUPPORTED` on hosts
 * without the method or when the plugin declares no debugRun (-32601).
 */
export declare function createTestsAPI(host: HostCall): {
  publish(runId: string, events: TestRunEvent[]): Promise<{ accepted: number; dropped: number }>;
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

/**
 * A notification button (host 0.3.0; older hosts ignore `actions`). At most 2 per
 * notification; `id` matches /^[A-Za-z0-9._-]{1,32}$/ and is unique, `title` is one
 * line of at most 24 characters, `command` is one of this plugin's commands (no arguments).
 */
export interface NotificationAction { id: string; title: string; command: string }

export declare function createNotificationsAPI(host: HostCall): {
  notify(notification: { title: string; body?: string; level?: 'info' | 'success' | 'warning' | 'error'; system?: boolean; viewId?: string; actions?: NotificationAction[] }): Promise<unknown>;
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
  /**
   * `'none'`: the model sees only the system prompt, `instructions` and this `prompt`
   * (tool calls of the same turn still see each other); the turn is still recorded in
   * the conversation. Omitted: earlier messages of the conversation are replayed.
   * Hosts released before this field ignore it and replay the history: check
   * `(await createHostAPI(host).describe()).features.aiTurnHistory === 1` first.
   */
  history?: 'none';
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

/** host.view.open (capability `ui`). */
export interface ViewOpenRequest {
  viewId: string;
  /** Another plugin's view; not allowed with raise. */
  pluginId?: string;
  /** With entry the page receives an open request carrying params. */
  entry?: string;
  /** Strings, numbers and booleans only; at most 16 keys. */
  params?: Record<string, string | number | boolean>;
  /**
   * Also bring the main window to the front, on the plugin's own tab view. Needs activation;
   * the host refuses an invalid token with error.data.code "activation_invalid", and any raise while MinCode is locked with "locked".
   */
  raise?: boolean;
  /** Single-use token from onGlobalShortcutActivation (valid 120 s). Only with raise. */
  activation?: string;
}

export declare function createViewsAPI(host: HostCall): {
  open(request: ViewOpenRequest): Promise<{ requested: boolean; raised?: boolean }>;
};

/** What started an action; a global shortcut press adds { trigger: { type: "globalShortcut", id } } to its payload. */
export interface Trigger {
  type: string;
  id: string;
}

/** Reads the trigger of an action payload (object or JSON text); null when there is none. */
export declare function triggerFrom(payload: unknown): Trigger | null;

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

// ---- services (host.services.*; callers need capability `plugins`) ----

export interface ServiceShape { kind: 'none' | 'text' | 'json' | 'file' | 'files'; accepts?: string[]; maxBytes?: number; maxFiles?: number; mime?: string }
export interface ServiceProviderInfo {
  pluginId: string; pluginName: string; entryId: string; title: string; titleLocalized?: Record<string, string>; description?: string;
  input: ServiceShape; output: ServiceShape; params?: Record<string, unknown>; risk: string; isDefault: boolean;
}
export interface ServiceInfo { service: string; providers: ServiceProviderInfo[] }
export interface ServiceProviderRef { pluginId: string; entryId?: string }
/** An input file: workspace (needs workspace.read), the caller's own file storage, or an upload token. */
export type ServiceFileSource = { source: 'workspace' | 'storage'; path: string } | { source: 'upload'; token: string };
/** A service file handle (never a path). */
export interface ServiceFile { token: string; name: string; mime: string; size: number }
export interface ServiceCall {
  service: string;
  /** Optional: name a provider; otherwise the user's default, or the user picks. */
  provider?: ServiceProviderRef;
  /** Text for a text service, file sources for a file service, omitted for none. */
  input?: string | ServiceFileSource[];
  params?: Record<string, unknown>;
  /** How long the approval / provider prompts may wait (5000–300000, default 25000). */
  timeoutMs?: number;
  /** SDK-only: how long invoke waits for the provider's run (default 300000, the longest any entry may run). */
  execTimeoutMs?: number;
  /**
   * false: a call that would need the user's approval or provider choice fails with code 'interaction_required'
   * (SERVICE_ERR_INTERACTION_REQUIRED) instead of asking (host 0.3.0+; older hosts answer invalid_params).
   * Omitted: true. Any other value throws a PluginError with code INVALID_ARGUMENT.
   */
  interactive?: boolean;
}
/** output: the text of a text service, the value of a json service, ServiceFile[] of a file service, or null. */
export interface ServiceResult<T = unknown> { provider: { pluginId: string; entryId: string }; output: T }
export interface ServiceProgress { completed?: number; total?: number; message?: string; /** The provider's progress as reported (≤ 4 KiB). */ raw?: unknown }
export interface ServiceSnapshot {
  callId: string; state: 'running' | 'succeeded' | 'failed' | 'cancelled'; provider: { pluginId: string; entryId: string };
  progress?: Omit<ServiceProgress, 'raw'>; rawProgress?: unknown; output?: unknown; error?: string; unconfirmed?: boolean;
}
export interface ServiceFilesAPI {
  /** Uploads data (≤ 64 MiB, 512 KiB chunks) for a { source: 'upload', token } input; resolves with the token. */
  upload(name: string, value: FileInput): Promise<string>;
  /** Reads a whole service file (a provider's input or a caller's output). */
  read(token: string, options?: { maxBytes?: number }): Promise<Buffer>;
  /** Copies an output into the caller's file storage (capability `storage`). */
  save(token: string, path: string): Promise<{ path: string; size: number }>;
  release(token: string): Promise<unknown>;
  /** Provider side: writes an output file of the running call; resolves with its token for { files: [token] }. */
  create(callId: string, name: string, value: FileInput): Promise<string>;
}
export interface ServicesAPI {
  list(service?: string): Promise<ServiceInfo[]>;
  /** Waits for the result; the host-call timeout covers timeoutMs + execTimeoutMs + 5 s. */
  invoke<T = unknown>(call: ServiceCall): Promise<ServiceResult<T>>;
  /** Resolves once the prompts are done and the call runs. */
  start(call: ServiceCall): Promise<{ callId: string; provider: { pluginId: string; entryId: string } }>;
  status(callId: string): Promise<ServiceSnapshot>;
  /** Cancelling is not rollback; an unconfirmed outcome ends as failed with unconfirmed: true. */
  cancel(callId: string): Promise<ServiceSnapshot>;
  /**
   * Polls after 250 ms, 500 ms, then every second until the call ends. A failed or cancelled call rejects with a
   * PluginError whose data is { code, state, callId, unconfirmed }. Aborting signal stops the wait, not the call.
   */
  wait<T = unknown>(callId: string, options?: { onProgress?: (progress: ServiceProgress) => void; signal?: AbortSignal }): Promise<ServiceResult<T>>;
  files: ServiceFilesAPI;
}
export declare function createServicesAPI(host: HostCall, options?: { maxChunkBytes?: number; maxFileBytes?: number; pollIntervalsMs?: number[] }): ServicesAPI;
/** The service error code of an interactive: false call that would have asked the user. */
export declare const SERVICE_ERR_INTERACTION_REQUIRED: 'interaction_required';
/** The service error code of a failure ('not_found', 'too_large', 'busy', 'timeout', 'cancelled', 'interaction_required', ...) or ''. */
export declare function serviceErrorCode(error: unknown): string;

/** Host-filled metadata after explicit provider opt-in. Not authentication, official identity or authorization. */
export type ServiceCallerInfo = { kind: 'plugin'; pluginId: string; source?: 'builtin' | 'local' | 'development' | 'unknown'; development?: boolean; /** Omitted above 128 UTF-8 bytes. */ version?: string } | { kind: 'host'; surface: string };

/** The payload a provider's action receives. Return { text } | { json } | { files: [token] } | {}. */
export interface ServiceRequest {
  callId: string; service: string; entry: string;
  text?: string;
  files?: ServiceFile[];
  params: Record<string, unknown>;
  caller: ServiceCallerInfo;
  /**
   * Extra context of the newer host surfaces (host 0.3.0: sftpFile, dbResult,
   * httpResponse, terminalSelection), trimmed by the host to the provider's
   * capabilities (remote identifiers need remote.context, database names
   * database.schema). Absent for plugin callers and the older surfaces.
   */
  surfaceContext?: Record<string, unknown>;
}
export declare function decodeServiceRequest(payload: unknown): ServiceRequest;

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
  /** Default false. Echo searchFileTargets:1 only when offered (workspace.read); otherwise keep strict old search payloads. */
  searchFileTargets?: boolean;
  /** Default false. Echo serviceCallerMetadata:1 only when offered; caller metadata is not authentication. */
  serviceCallerMetadata?: boolean;
  cleanup?: boolean;
  hostTimeoutMs?: number;
  formatResult?: (result: unknown) => unknown;
  allowNullPayload?: boolean;
  strictPayloadString?: boolean;
  errors?: { timeout?: string; busy?: string };
  validateInitialize?: (params: unknown) => Record<string, unknown> | void;
  onConfigurationChanged?: (keys: string[], context: { host: H }) => unknown;
  /**
   * Requires onEvent. After the first initialize reply, describe filters these
   * requests to entries with available === true; missing entries/available are
   * unsupported. No implicit additions. An empty intersection sends no subscribe
   * (use events.subscribe([]) to unsubscribe explicitly). Real discovery/subscribe
   * failures are logged; initialize acknowledgement does not await subscription.
   */
  events?: HostEvent[];
  onEvent?: <E extends HostEvent>(event: E, data: HostEventData[E], context: { host: H }) => unknown;
  /**
   * Runs after one of the plugin's global shortcut actions finished (successfully or not), once the
   * host got its ack. token is single-use and valid for 120 s: pass it to
   * createViewsAPI(host).open({ viewId, raise: true, activation: token }). Without it the request answers -32601.
   * The host does not idle-stop an on-demand plugin while it holds an unspent token; a stop, disable,
   * reload or crash still revokes it.
   */
  onGlobalShortcutActivation?: (id: string, token: string, context: { host: H }) => unknown;
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
