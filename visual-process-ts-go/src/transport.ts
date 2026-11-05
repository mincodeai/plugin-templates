// The framework-neutral MinCode plugin UI core from the published
// @mincodeai/plugin-ui package (its core/ entry points; update its version in
// package.json). It supports invoke, long tasks, trusted
// confirmation, clipboard, plugin settings, bound documents and host themes,
// with no UI framework.
export { createTransport } from "@mincodeai/plugin-ui/core/transport.js";
export type { HostContext, TaskSnapshot, Transport, TransportError, TransportOptions } from "@mincodeai/plugin-ui/core/transport.js";
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
} from "@mincodeai/plugin-ui/core/tasks.mjs";
export type { RunTaskOptions, TaskControl } from "@mincodeai/plugin-ui/core/tasks.mjs";
