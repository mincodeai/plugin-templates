// The shared MinCode plugin UI transport. src/mincode/ is a vendored copy of
// vue-app/src/plugin-ui (synchronized by `pnpm sync:plugin-ui` in the MinCode
// repository); do not edit it. It supports invoke, long tasks, trusted
// confirmation, clipboard, plugin settings, bound documents and host themes.
// The task helpers poll long tasks (runTask) and AI actions (runAIAction).
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
