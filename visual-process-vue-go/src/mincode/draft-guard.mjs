// Inline editors in plugin workspaces: an action that would drop an unsaved
// draft (disconnect, closing the editor or the current session) calls
// `if (!guard.allows(action)) return;` first. While `dirty()` is true the
// action is parked and `ask()` opens the plugin's discard confirmation;
// `discardAndContinue()` (its confirm button) calls `discard()` and then
// resumes the latest parked action, once. Bundled into each plugin; never
// import the host application.
export function createDraftGuard({ dirty, ask, discard }) {
  let parked = () => {};
  return {
    allows(action) { if (!dirty()) return true; parked = action; ask(); return false; },
    discardAndContinue() { const action = parked; parked = () => {}; discard(); action(); },
  };
}
