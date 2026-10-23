// The framework-neutral MinCode plugin UI core. src/mincode/ is a vendored copy
// synchronized from the MinCode repository (`pnpm sync:plugin-ui`); do not
// edit it. It supports invoke, long tasks, trusted confirmation, clipboard,
// plugin settings, bound documents and host themes, with no UI framework.
export { createTransport } from "./mincode/transport.js";
export type { HostContext, TaskSnapshot, Transport, TransportError, TransportOptions } from "./mincode/transport.js";
export {
  AI_TASK_TIMEOUT_MS,
  TASK_POLL_MS,
  TASK_TIMEOUT_MS,
  clipUtf8,
  isTaskUnsupported,
  runAIAction,
  runTask,
  runTaskOrCall,
  utf8Length,
} from "./mincode/tasks.mjs";
export type { RunTaskOptions, TaskControl } from "./mincode/tasks.mjs";
