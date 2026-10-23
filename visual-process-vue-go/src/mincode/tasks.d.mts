import type { TaskSnapshot, Transport } from './transport';

export declare const TASK_POLL_MS: number;
/** Fallback poll interval while the host pushes task snapshots. */
export declare const TASK_PUSH_POLL_MS: number;
export declare const TASK_TIMEOUT_MS: number;
export declare const AI_TASK_TIMEOUT_MS: number;

export interface TaskControl {
  /** Set while the task runs; cancels it on the host. */
  cancel?: (() => void) | null;
  taskId?: string;
}

export interface RunTaskOptions {
  timeoutMs?: number;
  /** Poll interval; defaults to TASK_PUSH_POLL_MS when the host pushes snapshots, else TASK_POLL_MS. */
  pollMs?: number;
  /** Polling budget; defaults to timeoutMs + 10 s. Past it the task is cancelled and the error is `uncertain`. */
  deadlineMs?: number;
  /** Called with the first snapshot once the host accepted the task. */
  onStart?: (snapshot: TaskSnapshot) => void;
  /** Called with every snapshot, including the final one. */
  onSnapshot?: (snapshot: TaskSnapshot) => void;
  onProgress?: (progress: unknown) => void;
  control?: TaskControl;
  /** Returning false stops polling, cancels the task and rejects with `cancelled`. */
  alive?: () => boolean;
  sleep?: (ms: number) => Promise<unknown>;
  now?: () => number;
}

export declare function isTaskUnsupported(error: unknown): boolean;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function runTask<T = any>(tasks: Pick<Transport['tasks'], 'start' | 'get' | 'cancel'> & Partial<Pick<Transport['tasks'], 'pushSupported' | 'onChanged'>>, action: string, payload?: unknown, options?: RunTaskOptions): Promise<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function runTaskOrCall<T = any>(transport: Pick<Transport, 'tasks' | 'call'>, action: string, payload?: unknown, options?: RunTaskOptions): Promise<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function runAIAction<T = any>(transport: Pick<Transport, 'tasks' | 'call'>, action: string, payload?: unknown, options?: RunTaskOptions): Promise<T>;
export declare function utf8Length(text: unknown): number;
export declare function clipUtf8(text: unknown, maxBytes: number): string;

/** Fields runTask/runTaskOrCall/runAIAction add to the errors they throw. */
export interface TaskError extends Error {
  cancelled?: true;
  uncertain?: true;
  code?: unknown;
  result?: unknown;
  snapshot?: TaskSnapshot;
}
