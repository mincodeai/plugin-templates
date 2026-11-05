# MinCode Vue 3 + Go visual plugin template

This is the recommended source-project template for a third-party MinCode visual plugin. It builds a Vue 3 + Element Plus UI and an isolated Go process into one installable `dist-plugin/` directory.

MinCode does not run `pnpm install`, `go mod download`, or `go build` while installing a plugin. Build dependencies stay in this source project; end users install only `dist-plugin/` and do not need Node.js, pnpm, Go, source code, or `node_modules`.

## Project layout

```text
visual-process-vue-go/
├── backend/                       # independent Go module and process runtime
│   ├── go.mod                     # requires the published github.com/mincodeai/plugin-sdk-go
│   ├── main.go                    # Options + action handlers (your code)
│   └── main_test.go
├── src/                           # Vue 3 + Element Plus source
│   ├── App.vue
│   ├── main.ts
│   └── transport.ts
├── scripts/                       # build, protocol test, and package verification
├── plugin.template.json           # source manifest with build placeholders
├── package.json                   # depends on the published @mincodeai/plugin-ui
├── mincode.project.json           # template and MinCode version that created the project
└── dist-plugin/                   # generated installable package; do not hand-edit
    ├── plugin.json
    ├── bin/
    └── ui/
```

## Quick start

Create a project with the `mincode` command-line tool that ships with MinCode, change its metadata, then install dependencies:

```bash
mincode plugin create ~/Developer/my-mincode-plugin --id my-mincode-plugin --template visual-process-vue-go
cd ~/Developer/my-mincode-plugin
pnpm install
pnpm verify
```

The project depends on the published MinCode modules at the versions recommended by the MinCode release that created it (`github.com/mincodeai/plugin-sdk-go` in `backend/go.mod`, `@mincodeai/plugin-ui` in `package.json`), so the first `pnpm install` and the first backend build need network access to the npm registry and the Go module proxy (the first build runs `go mod tidy` once to create `backend/go.sum`; commit it). Later builds use the local caches. Behind a slow or blocked network, set `GOPROXY` (for example `https://goproxy.cn,direct`) and an npm registry mirror.

`pnpm verify` runs Go unit tests, an executable-level JSON-RPC protocol test, Vue type checking, the UI/backend build, and package-limit checks. Install the generated absolute directory from **Plugin Management**:

```text
~/Developer/my-mincode-plugin/dist-plugin
```

Set the required `category` (default `development`) and optional `tags`/`homepage` in `plugin.template.json` according to the [catalog contract](https://www.mincodeai.cn/llms/local-plugin-template.md); the build preserves these fields in `plugin.json`. Only the built `plugin.json` is accepted; there is no legacy fallback or automatic migration. Invalid installed packages retain configuration/KV and show an error without starting.

Review the read-only preflight and explicitly confirm installation. Preflight does not copy, register, enable, execute, or write plugin data; installation revalidates. New local plugins install disabled. Review the capabilities, enable the plugin, and open **Vue + Go Plugin**. The same runtime protocol v1 supports custom third-party implementations, the Go SDK used here, or the optional Node SDK; the installer never injects a runtime.

## Page bridge and browser preview

`src/transport.ts` re-exports the shared MinCode plugin page bridge from the `@mincodeai/plugin-ui` package (`@mincodeai/plugin-ui/transport.js`). Besides `call(action, payload)` it offers long tasks (`tasks.start/get/cancel`), trusted host confirmation (`confirm`), clipboard writes, plugin settings (`configuration.get/open`), bound documents and host theme tokens, all typed by the package's `transport.d.ts`.

Do not hand-write polling loops for long actions. `src/transport.ts` also re-exports the task helpers from `@mincodeai/plugin-ui/tasks.mjs`:

```ts
import { runAIAction, runTask, runTaskOrCall, type TaskControl } from "./transport";

// AI action (180 s budget); the Go backend uses host.CompleteAITurn / ClassifyAIError.
const summary = await runAIAction<{ text: string }>(transport, "summarize", { text });
// Any long action: polls until done; control.cancel() cancels, alive() === false cancels automatically.
const control: TaskControl = {};
const report = await runTask(transport.tasks, "export", payload, { control, alive: () => open.value, onProgress: p => (progress.value = p) });
// Falls back to transport.call on hosts without the task protocol.
const rows = await runTaskOrCall(transport, "import", payload);
```

Errors carry `cancelled: true` (cancelled; `result` holds any partial result) or `uncertain: true` (a poll failed, the deadline passed or the host could not confirm the outcome; do not retry blindly); failed tasks throw the host's message with `code` and `snapshot`. `onSnapshot` sees every snapshot (e.g. `cancelRequested`), and `pollMs` / `deadlineMs` tune polling. `clipUtf8`/`utf8Length` keep payloads within the 256 KiB limit.

To iterate on the page without the desktop app, run the mock host from the MinCode plugin development kit (in the MinCode repository the script is `tools/plugin-devkit/mock-host.mjs`) against the built package. Run `pnpm verify` in the project first, then from the kit root:

```bash
node tools/mock-host.mjs /absolute/my-plugin/dist-plugin   # add --responses fixtures.json for UI-only work
```

It embeds the page with the same sandbox and handshake as MinCode, forwards actions to the real Go process through an in-memory host, confirms `write`/`dangerous` actions, and switches theme and locale. It is a development aid; finish with a desktop smoke test.

## Go plugin SDK

The backend is built on the MinCode Go plugin SDK (module `github.com/mincodeai/plugin-sdk-go`, standard library only). The SDK owns the JSON-RPC loop: line framing, request ids, `plugin.initialize` / `plugin.ping` / `plugin.shutdown`, the concurrency limit, and reverse host requests (`host.storage.*`, `host.secrets.*`). `backend/main.go` only builds `rpc.Options` from the `rpc.StrictDefaults` preset and supplies a `Handler` that dispatches actions:

```go
o := rpc.StrictDefaults("vue-go-plugin")
o.KnownAction = func(action string) bool { _, ok := actions[action]; return ok }
o.Handler = func(ctx context.Context, action string, payload json.RawMessage) (any, error) {
	return actions[action](ctx, payload)
}
rpc.Main(o)
```

Return a value for a result, `rpc.NewError(code, message)` for an exact error, or any other error for `-32000`. `host.FromContext(ctx).Call(ctx, "host.storage.get", params)` performs a reverse request; `jsonx.DecodeObject` strictly decodes payloads; `profiles.Store` / `profiles.Secrets` store connection profiles and credentials through the host; `rpctest.NewFakeHost()` is an in-memory host for handler unit tests. The package reference is the SDK's README (`go doc github.com/mincodeai/plugin-sdk-go/rpc`, or the module page on pkg.go.dev).

The SDK is a normal published Go module; `backend/go.mod` requires the version recommended by your MinCode release:

```text
require github.com/mincodeai/plugin-sdk-go vX.Y.Z
```

Its version follows MinCode releases. To move to a newer SDK, change the version (`cd backend && go get github.com/mincodeai/plugin-sdk-go@vX.Y.Z && go mod tidy`) and re-run `pnpm verify`.

Inside the MinCode repository the template's `go.mod` additionally carries a `// mincode:workspace` replace that points at the repository SDK source; `mincode plugin create` removes those two lines from generated projects. Projects created by older MinCode versions carry a vendored copy under `backend/third_party/plugin-sdk-go` instead; `mincode plugin upgrade` migrates such projects to the published module, and `mincode plugin sync` still updates the copies until then.

## Adding dependencies

Vue packages are normal project dependencies and are bundled into local static assets:

```bash
pnpm add some-vue-package
pnpm build
```

Do not copy `node_modules` into `dist-plugin/`, and do not load scripts, styles, fonts, or images from a CDN. The plugin iframe CSP intentionally blocks remote assets.

Go packages are normal module dependencies and are linked into the executable:

```bash
cd backend
go get example.com/some/module@v1.2.3
go mod tidy
cd ..
pnpm verify
```

Commit `go.mod`, `go.sum` when generated, `package.json`, and `pnpm-lock.yaml`. Review licenses, maintenance, and known vulnerabilities before adding third-party packages. Prefer pure-Go drivers when practical; CGO and dynamic libraries require platform-specific packaging and signing work.

## Cross-platform builds

The default build targets the current machine. Override Go's target variables for another operating system or CPU architecture:

```bash
GOOS=linux GOARCH=amd64 pnpm build
GOOS=windows GOARCH=amd64 pnpm build
GOOS=darwin GOARCH=arm64 pnpm build
```

The generated manifest lists exactly that target operating system. The current MinCode manifest selects runtime entries by operating system, not CPU architecture, so publish separate packages per OS/architecture. A macOS universal binary is another valid option.

Cross-compiling CGO-based modules normally needs a target C toolchain and cannot be treated like a pure-Go build. On macOS/Linux, preserve the executable bit on the generated binary when archiving the package.

## Runtime and security contract

- `apiVersion: 2` is the manifest format; `runtimeProtocolVersion` remains `1`.
- The Go process communicates through newline-delimited UTF-8 JSON-RPC 2.0 (implemented by the Go plugin SDK).
- stdout is protocol-only. Send diagnostics to stderr; never print ad-hoc text to stdout.
- The host calls `plugin.initialize`, `plugin.invoke`, `plugin.ping`, and `plugin.shutdown`.
- The Vue UI calls only actions declared with `uiCallable: true`, through the transferred `MessagePort`.
- The iframe cannot import the host Vue/Pinia/router/Wails runtime or access the parent DOM.
- A local process plugin is not an OS sandbox. It runs with the current user's operating-system rights.
- The complete package is limited to 2,000 files and 64 MiB; each UI asset is limited to 5 MiB; a process RPC message is limited to 1 MiB.
- Use bounded pagination or cursors for large results. Do not return an unbounded database result in one RPC message.
- Host plugin KV is for small non-sensitive configuration only. Do not store passwords, tokens, private keys, or database connection secrets there.

See `docs/development/plugin-development.md`, `docs/architecture/plugin-system.md`, and `docs/architecture/plugin-ui-system.md` in the MinCode repository for the complete contracts.

## Shared plugin UI components

The `@mincodeai/plugin-ui` package contains MinCode's iframe UI library, published as source (`.vue`, `.js`, `.ts` with type declarations) that your Vite build compiles and bundles:

- `mount.js`: mounts the plugin's own Vue app and loads shared foundation, Element Plus control and scrollbar styles. Import any additional Element Plus component styles explicitly (the starter imports card/descriptions styles).
- `PluginConnectionBar.vue`: status, saved-profile picker, management footer and connection actions.
- `PluginStatusArea.vue`: compact placement for simultaneous notices; it does not hide warnings or own their conditions.
- `PluginTaskPanel.vue`, `PluginResults.vue`, `OfficialPluginPage.vue`: task progress, structured results and configurable form-page helpers.
- `transport.js`, `tasks.mjs`: the same typed bridge/task API re-exported by `src/transport.ts`.

Import its files by package path, for example `@mincodeai/plugin-ui/mount.js`; this is a build-time dependency, not a runtime import from the desktop application. Vue, Element Plus (its peer dependencies) and the icons are declared dependencies and are bundled into your plugin's `dist-plugin/ui/`. Because the package ships `.vue` sources, `vite.config.ts` excludes it from dependency pre-bundling (`optimizeDeps.exclude`). Never import host Pinia, Router, Wails bindings or application instances.

A connection toolbar needs your plugin's profile data and business handlers; it does not implement a connection backend. This complete example keeps those actions in the parent:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import PluginConnectionBar from '@mincodeai/plugin-ui/PluginConnectionBar.vue';
import type { PluginConnectionLabels } from '@mincodeai/plugin-ui/PluginConnectionBar.vue';

const props = defineProps<{
  labels: PluginConnectionLabels; // supply translated zh/en copy
  ready: boolean;
  connected: boolean;
  busy: boolean;
  profiles: { id: string; name: string }[];
}>();
const selected = ref('');
const emit = defineEmits<{
  profile: [id: string]; manage: []; new: []; settings: [];
  connect: []; disconnect: [];
}>();
</script>

<template>
  <PluginConnectionBar
    v-model="selected"
    :labels="props.labels"
    :ready="props.ready"
    :connected="props.connected"
    :profiles="props.profiles"
    :select-disabled="props.busy"
    :new-disabled="props.busy"
    :settings-disabled="props.busy"
    :connect-disabled="props.busy"
    :connect-loading="props.busy"
    :disconnect-disabled="props.busy"
    disconnectable
    @update:model-value="emit('profile', $event)"
    @manage="emit('manage')"
    @new="emit('new')"
    @settings="emit('settings')"
    @connect="emit('connect')"
    @disconnect="emit('disconnect')"
  />
</template>
```

`labels` requires `waiting`, `connected`, `disconnected`, `unsaved`, `profile`, `manageProfiles`, `newConnection`, `settings`, `connect`; also supply `disconnect` when using `disconnectable`, and `modified` when showing a modified-profile tag. Keep actual host calls, confirmation and connection state in your parent page. Omit `disconnectable` for backends whose primary action should remain Reconnect. `profileDetail`/`profileLive` callbacks and the `status`, `settings`, `actions` slots support plugin-specific details.

Use the notice area without changing error/security conditions:

```vue
<PluginStatusArea :locale="locale">
  <ElAlert v-if="error" :title="error" type="error" :closable="false" />
  <ElAlert v-if="insecure" :title="copy.insecureWarning" type="warning" :closable="false" />
</PluginStatusArea>
```

Import `PluginStatusArea` from `@mincodeai/plugin-ui/PluginStatusArea.vue`. Ordinary scroll areas use `ElScrollbar`; use either the shared mount's page scrollbar or your own page scrollbar, not two nested primary scrollbars. The starter owns its page scrollbar and passes `{ pageScrollbar: false }` to `mountPlugin`.

### Updating the UI library

Do not copy or edit the package's files; keep customizations in your own components and styles. To move to a newer version, change `@mincodeai/plugin-ui` in `package.json` (`pnpm add @mincodeai/plugin-ui@X.Y.Z`), re-run `pnpm verify`, then rebuild and reinstall the plugin. Already installed plugins never change just because the library or host was updated.

Projects created by older MinCode versions carry a vendored copy in `src/mincode/` behind a local Vite/TypeScript alias instead. `mincode plugin upgrade` migrates them to `@mincodeai/plugin-ui` (removes the copy and the alias and rewrites the imports that pointed into it); `mincode plugin sync --check` / `mincode plugin sync` still update unmigrated copies. Both stop before writing anything when a managed copy file was edited locally.
