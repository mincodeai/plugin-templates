# MinCode local process plugin template (Node.js)

This dependency-free template implements the MinCode local-process plugin API v1.
It is intended for **macOS and Linux** hosts with Node.js 18 or newer. It uses a
single executable `bin/plugin.mjs` entrypoint and a bundled `lib/runtime.mjs`, so no
`npm install` is required.

## Quick start

1. Copy this directory outside the MinCode repository and rename it, for example:

   ```bash
   cp -R tools/plugin-templates/local-process-node ~/Developer/my-mincode-plugin
   cd ~/Developer/my-mincode-plugin
   ```

2. Edit `plugin.json` before installing:
   - Set a unique lower-case `id`, a display `name`, `version`, and `author`.
   - Choose the required `category` (default `development`) and optional `tags`/`homepage` according to the [catalog contract](../../../../docs/development/local-plugin-template.md). Only `plugin.json` is accepted; no legacy fallback or automatic migration occurs. Invalid installed packages retain configuration/KV and show an error without starting.
   - Update the command IDs, labels, keywords, actions, and declared capabilities.
   - Keep `runtime.entry` relative to this directory. Absolute paths and traversal are rejected.

3. Keep the runtime executable:

   ```bash
   chmod +x bin/plugin.mjs
   node --check bin/plugin.mjs
   ```

4. In **插件管理 / Plugin Management**, enter the absolute directory path, choose
   **安装 / Install**, review the read-only preflight, explicitly confirm installation, then enable the installed plugin. Preflight does not copy, register, enable, execute, or write plugin data; installation revalidates.

5. Run either contributed command from the command palette:
   - `hello` returns a structured greeting.
   - `counter` increments a value in host-provided plugin storage.

## Verification in the MinCode repository

Run `node --test tools/verify/node-plugin-templates.test.mjs` from the repository root.
The tests copy both Node templates to temporary directories and verify their executable
entries, lifecycle, host storage callbacks, errors, and shutdown cleanup.

## Bundled runtime SDK

Copy the entire template, including `lib/runtime.mjs`. The entrypoint imports this
package-local copy of the shared `packages/plugin-sdk/node/runtime.mjs` SDK, so the
copied or installed plugin runs independently of the MinCode source checkout and
working directory. `bin/plugin.mjs` contains only business actions and `start`
configuration; the SDK handles JSON-RPC, host callbacks, timeouts, and cleanup.

The SDK is optional, not a required host dependency. You may replace the bundled
runtime with your own implementation as long as it preserves the MinCode protocol
contract. Keep stdout protocol-only and retain payload validation and cleanup.

## Protocol rules

- The process communicates through newline-delimited UTF-8 JSON-RPC 2.0.
- **stdout is protocol-only**: exactly one JSON object per line. Write diagnostics to stderr.
- The host calls `plugin.initialize`, `plugin.invoke`, `plugin.ping`, and `plugin.shutdown`.
- The template calls `host.log` and `host.storage.*`; therefore its manifest declares `storage`.
- Storage is for small non-sensitive configuration. Never store credentials, tokens, private keys,
  or connection strings.
- The plugin process boundary is not an OS sandbox. Request only the capabilities you need and
  treat `shell`, `network`, workspace access, and secrets as high-risk declarations.

See [`docs/architecture/plugin-system.md`](../../../../docs/architecture/plugin-system.md) in the
MinCode repository for the complete manifest schema, capability model, packaging restrictions,
and JSON-RPC contract.
