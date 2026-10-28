// Type declarations for transport.js, the plugin UI side of the host bridge
// (sandboxed iframe + MessageChannel, protocol v1). Keep in sync with transport.js.

export interface HostContext {
  locale?: string;
  localeTag?: string;
  /** Built-in theme name (light, dark, graphite, ...). */
  theme?: string;
  themeKind?: 'light' | 'dark';
  /** Validated `--app-*` tokens of a contributed theme; applied automatically. */
  themeTokens?: Record<string, string>;
  /** Where the host embeds the page. */
  surface?: 'workspace' | 'document' | 'widget' | 'floating';
  [key: string]: unknown;
}

/**
 * Rejections carry a host error code such as busy, cancelled, not-allowed, invalid-request, payload-too-large, host-unavailable.
 * While a closed tab's page is kept warm (visible() is false and the tab is closed), the host answers not-allowed to
 * confirm, pickPath, configuration.open, clipboard.writeText, floating show/activate/resize, aiConfig.apply, write/dangerous actions,
 * actions with host result handling and tasks.start; reads, request(), configuration.get and task get/cancel still work.
 */
export interface TransportError extends Error {
  code: string;
  retryable: boolean;
  cancelled: boolean;
  /** true when the request timed out and the operation may still be running. */
  uncertain?: boolean;
  details?: unknown;
}

export interface TaskSnapshot {
  taskId: string;
  state: 'running' | 'succeeded' | 'failed' | 'cancelled';
  cancelRequested: boolean;
  outcomeUnconfirmed?: boolean;
  progress?: unknown;
  result?: unknown;
  error?: string;
}

export interface BoundDocument {
  name: string;
  relativePath: string;
  size: number;
  access: 'read' | 'readWrite';
  chunkBytes: number;
  maxReadBytes: number;
  maxWriteBytes: number;
  path?: string;
}

export interface OpenRequest {
  requestId: string;
  source: string;
  entry: string;
  path?: string;
  pathParams?: Record<string, string>;
  params?: Record<string, string>;
}

/** An absolute path the user dropped, pre-filtered by the view's manifest fileDrop rules. */
export interface DroppedPath {
  path: string;
  [key: string]: unknown;
}

/**
 * ai.config: one model profile, MCP connector or skill as the source app stores it. `sourceId` must be stable
 * across runs (it identifies the item on the next sync); invalid or duplicate items reject the whole request.
 */
export type AiConfigItem = { sourceId: string; name: string; sourceApp: string } & (
  | {
      kind: 'profile';
      profile: {
        baseUrl: string;
        apiKey: string;
        model: string;
        apiFormat: 'openai' | 'openai-responses' | 'anthropic';
        anthropicAuth?: 'x-api-key' | 'bearer';
        commonModels: string[];
        subagentModel?: string;
        reasoningEffort?: string;
        contextWindow?: number;
      };
    }
  | {
      kind: 'mcp';
      mcp: { transport: 'stdio' | 'http'; command: string; args: string[]; url: string; env: Record<string, string>; headers: Record<string, string> };
    }
  | { kind: 'skill'; skill: { content: string; description?: string; docsUrl?: string; hasExtraFiles: boolean } }
);

/** ai.config: how an item compares with the saved settings. Never contains secret values. */
export interface AiConfigPreviewEntry {
  key: string;
  kind: 'profile' | 'mcp' | 'skill';
  name: string;
  sourceApp: string;
  status: 'new' | 'update' | 'conflict' | 'unchanged';
  needsSecret: boolean;
  changedFields: string[];
  secretChanged: boolean;
  targetName?: string;
  /** "possible-duplicate", "extra-files". */
  notes: string[];
}

/** ai.config: "add" fits status new, "overwrite" fits update and conflict. */
export interface AiConfigChoice {
  key: string;
  action: 'add' | 'overwrite';
}

/**
 * ai.config login: only the outcome, never a token. `reason` (failed only) is a short code such as
 * "not-installed", "unsupported", "network", "timeout", "denied" or "failed".
 */
export interface AiConfigLoginResult {
  status: 'signed-in' | 'cancelled' | 'failed';
  reason?: string;
}

/** ai.config auth-status: one word per asked sourceId; "not-installed" when this plugin has no connector for it. */
export type AiConfigAuthStatus = 'signed-in' | 'signed-out' | 'needs-login' | 'not-installed';

export interface AiConfigApplyResult {
  added: number;
  overwritten: number;
  failed: { key: string; reason: string }[];
}

export interface TransportOptions {
  /** Host waits for this acknowledgement before closing or popping out a workspace tab. Reject to keep it open. Not an OS shutdown guarantee. */
  onSave?(): Promise<void>;
  onReady(): void;
  onError(message: string): void;
  applyContext(context: HostContext): void;
  onFilesDropped?(files: unknown[]): void;
  onPathsDropped?(entries: DroppedPath[]): void;
  onConfigurationChanged?(change: { keys: string[]; values: Record<string, unknown> }): void;
  onDocumentChanged?(document: BoundDocument): void;
  /** One of this plugin's floating views (views[].floating) opened or closed. */
  onFloatingChanged?(change: { viewId: string; visible: boolean }): void;
}

export interface Transport {
  /**
   * Invokes a UI-callable manifest action; the host confirms write/dangerous actions.
   * Busy conflicts (the plugin's serial gate) are retried after 50, 100, 250, 500, 1000, 2000, 4000 and 8000 ms;
   * close() rejects a call waiting to retry with code `busy` (it never ran).
   */
  call<T = unknown>(action: string, payload?: unknown): Promise<T>;
  /**
   * Calls a method the plugin process registered for its views (plugin.call; SDK `methods`).
   * No risk confirmation and never offered to AI: keep writes and dangerous operations in actions.
   */
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
  /** Whether the host supports free-form messages (features.messages). */
  messagesSupported(): boolean;
  /**
   * Posts a free-form JSON value to this plugin's process, like VS Code's webview postMessage
   * (SDK `onUIMessage`). Messages arrive in order; resolves once the process accepted it.
   * At most 256 KiB; no risk confirmation and never offered to AI, so keep writes and dangerous
   * operations in actions.
   */
  postMessage(message: unknown): Promise<void>;
  /** Receives messages the plugin process posted (SDK `postUIMessage`) in order; returns an unsubscribe function. */
  onMessage(listener: (message: unknown) => void): () => void;
  /** Binary frames to and from the plugin process; needs plugin.json runtime.transport "framed". */
  binary: {
    supported(): boolean;
    /**
     * "direct" while the fast socket to the host is open (newer hosts open it automatically for framed
     * plugins), "bridge" while frames are relayed over the page channel. Both reach the same process.
     */
    mode(): 'direct' | 'bridge';
    /**
     * Sends one frame of at most 8 MiB (chunk larger data). Over the direct socket it resolves once
     * queued; over the bridge, once the host forwarded it.
     */
    send(channel: string, data: Uint8Array | ArrayBuffer): Promise<unknown>;
    /** Receives frames the plugin process sent; returns an unsubscribe function. */
    onMessage(listener: (channel: string, data: Uint8Array) => void): () => void;
  };
  /**
   * Hides the MinCode chrome and makes the window fullscreen while this page is the visible view
   * (remote desktops, media). The host keeps its own exit control and ends it when the page is
   * hidden or closed. enter/exit reject with code "not-allowed" on hosts without the feature.
   */
  immersive: {
    supported(): boolean;
    active(): boolean;
    enter(): Promise<boolean>;
    /** Resolves to false when this page was not immersive. */
    exit(): Promise<boolean>;
    /** Called with every change, including exits the host made; returns an unsubscribe function. */
    onChanged(listener: (active: boolean) => void): () => void;
  };
  /**
   * Pauses MinCode shortcuts so key combinations reach this page. The host releases it on Ctrl+Alt+Enter,
   * when the window or page loses focus, or when the page closes. System shortcuts (for example Cmd+Tab)
   * never reach the page.
   */
  keyboard: {
    supported(): boolean;
    captured(): boolean;
    capture(): Promise<boolean>;
    release(): Promise<boolean>;
    /** Called when the host released the keyboard; returns an unsubscribe function. */
    onReleased(listener: () => void): () => void;
  };
  /**
   * Opens a host file or folder dialog after the host asks the user to confirm.
   * With `{ multiple: true }` (files only) resolves to the chosen paths (at most 1000);
   * `extensions` (e.g. `['.epub']`, at most 32) filters the dialog and the result.
   * Resolves to null when the user cancels.
   */
  pickPath(kind: 'file' | 'directory', options?: { multiple?: false; extensions?: string[] }): Promise<string | null>;
  pickPath(kind: 'file', options: { multiple: true; extensions?: string[] }): Promise<string[] | null>;
  close(): void;
  surface(): 'workspace' | 'document' | 'widget' | 'floating';
  /**
   * features.visibility: false while the host hides this page (an inactive tab, or a closed tab the host
   * keeps warm for a fast reopen). Always true on hosts without the feature. Advisory: pause timers and polling.
   */
  visible(): boolean;
  /**
   * views[].prefetch: the result of the view's declared read-only action, which the host invoked through this
   * session while the page loaded. Resolves once with the result for the declared action; resolves undefined when
   * the host does not support prefetch, the view declares none or another action, the prefetch failed, or the
   * result was already taken. Fall back to call() on undefined.
   */
  prefetched<T = unknown>(action: string): Promise<T | undefined>;
  /** Called with the new value whenever visible() changes; returns an unsubscribe function. */
  onVisibilityChange(listener: (visible: boolean) => void): () => void;
  /** views[].floating: this plugin's floating views, each in its own frameless always-on-top window. */
  floating: {
    supported(): boolean;
    /** Opens the view's window (remembered across restarts); resolves to true. */
    show(viewId: string): Promise<boolean>;
    /** Closes the view's window; resolves to false. */
    hide(viewId: string): Promise<boolean>;
    visible(viewId: string): Promise<boolean>;
    /**
     * In the floating window: called when the user clicks it (a drag is not a click). The page receives no
     * pointer events there, so the host passes where the click landed in page CSS pixels (undefined when unknown);
     * use it with document.elementFromPoint to tell which of the page's own elements was clicked.
     */
    onClick(handler: ((point?: { x: number; y: number }) => void) | null): void;
    /**
     * In the floating window, right after onClick: open something in the main window (brought to the front).
     * One call per click; "view" opens one of this plugin's tab views, "ai-run" / "ai-runs" need capability ai.activity (run IDs come from ai.activity or ai.tasks); "ai-run-cancel" stops an unfinished run without raising the main window and needs capability ai.tasks.
     */
    activate(target: { kind: 'app' } | { kind: 'view'; viewId: string } | { kind: 'ai-run'; runId: string } | { kind: 'ai-run-cancel'; runId: string } | { kind: 'ai-runs' }): Promise<unknown>;
    /** Only from the page inside the floating window: resize it (48 px up to the declared size), keeping its bottom-center in place. */
    resize(width: number, height: number): Promise<unknown>;
  };
  clipboard: {
    writeText(text: string, options?: { sensitive?: boolean }): Promise<boolean>;
  };
  /** Trusted host confirmation; resolves false when the user declines. */
  confirm(request: { intent: 'write' | 'dangerous'; subject: string }): Promise<boolean>;
  /**
   * ai.config (plugin.json capability): propose model profiles, MCP connectors and skills to the AI settings.
   * Methods reject with code "not-allowed" when supported() is false.
   */
  aiConfig: {
    /** level() >= 1. */
    supported(): boolean;
    /**
     * What the host offers: 0 none, 1 preview/apply, 2 also connector prompts, auth, login and authStatus. The transport is
     * bundled into the page, so check this rather than whether a method exists.
     */
    level(): number;
    /** Compares the items with the saved settings; entries never contain API keys or env/header values. */
    preview(items: AiConfigItem[]): Promise<{ entries: AiConfigPreviewEntry[] }>;
    /**
     * Writes the chosen entries after the host's own confirmation dialog; rejects with code "cancelled" when the
     * user declines, "busy" while another apply of this plugin is open. Added connectors start turned off. Only the
     * items the dialog listed are written; other choices come back in `failed` ("invalid-choice"), as do items that
     * changed after the dialog was shown ("changed-since-review").
     */
    apply(items: AiConfigItem[], choices: AiConfigChoice[]): Promise<AiConfigApplyResult>;
    /**
     * Level 2: the host signs in to the connector this plugin installed for `sourceId` (browser or device flow,
     * shown in a host dialog). Rejects with "not-allowed" below level 2, "busy" while another apply or login of
     * this plugin is open; a connector not installed by this plugin resolves as failed with "not-installed".
     */
    login(sourceId: string): Promise<AiConfigLoginResult>;
    /**
     * Level 2, read-only: the sign-in status of the connectors this plugin installed, for 1-200 distinct item
     * sourceIds in one request. Connectors of other plugins or added by hand are "not-installed"; a connector
     * without the host sign-in is "signed-out" unless it is signed in. Never a token, address or error text.
     * Rejects with "not-allowed" below level 2.
     */
    authStatus(sourceIds: string[]): Promise<{ statuses: Record<string, AiConfigAuthStatus> }>;
  };
  configuration: {
    /** Non-secret settings only; secret settings stay with the plugin process. */
    get(keys?: string[]): Promise<Record<string, unknown>>;
    open(): Promise<boolean>;
  };
  document: {
    info(): BoundDocument | null;
    readAll(options?: { maxBytes?: number }): Promise<Uint8Array>;
    readText(options?: { maxBytes?: number }): Promise<string>;
    save(content: string | Uint8Array): Promise<unknown>;
    setDirty(dirty: boolean): Promise<unknown>;
  };
  onDocumentSaveRequest(handler: (() => unknown) | null): void;
  onOpenRequest(handler: ((request: OpenRequest) => void) | null): void;
  /** Long tasks; the plugin process must negotiate features.tasks = 1. */
  tasks: {
    start(action: string, payload?: unknown, timeoutMs?: number): Promise<TaskSnapshot>;
    get(taskId: string): Promise<TaskSnapshot>;
    cancel(taskId: string): Promise<TaskSnapshot>;
    /** true when the host pushes snapshots of tasks this page started (features.taskEvents). */
    pushSupported(): boolean;
    /** Receives every pushed snapshot of a task this page started; returns an unsubscribe function. */
    onChanged(listener: (snapshot: TaskSnapshot) => void): () => void;
  };
}

export declare function createTransport(options: TransportOptions): Transport;
