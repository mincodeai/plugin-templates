// The shared MinCode plugin UI transport from the published @mincodeai/plugin-ui
// package (update its version in package.json; never copy or edit its files). It
// supports invoke, long tasks, trusted confirmation, clipboard, plugin settings,
// bound documents and host themes. The task helpers poll long tasks (runTask)
// and AI actions (runAIAction).
export { createTransport } from "@mincodeai/plugin-ui/transport.js";
export type { HostContext, TaskSnapshot, Transport, TransportError, TransportOptions } from "@mincodeai/plugin-ui/transport.js";
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
} from "@mincodeai/plugin-ui/tasks.mjs";
export type { RunTaskOptions, TaskControl } from "@mincodeai/plugin-ui/tasks.mjs";
