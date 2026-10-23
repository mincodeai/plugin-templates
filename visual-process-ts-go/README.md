# MinCode TypeScript + Go visual plugin template

A build-first source project for a third-party MinCode visual plugin **without a UI framework**. The page is plain TypeScript and DOM APIs bundled by Vite; the backend is the same isolated Go process as the Vue + Go template. Use it as the starting point for React, Svelte, Solid, plain TypeScript or any other front end that builds to static assets.

MinCode does not run `pnpm install`, `go mod download`, or `go build` while installing a plugin. End users install only `dist-plugin/` and need no Node.js, pnpm, Go, source code, or `node_modules`.

## Project layout

```text
visual-process-ts-go/
├── backend/                       # independent Go module and process runtime
│   └── third_party/plugin-sdk-go/ # vendored MinCode Go plugin SDK; do not edit
├── src/
│   ├── main.ts                    # the page (replace with your framework's entry)
│   ├── styles.css                 # page styles using --app-* theme variables
│   ├── transport.ts               # re-exports the bridge and task helpers
│   └── mincode/                   # vendored framework-neutral UI core; do not edit
├── scripts/                       # build, protocol test, and package verification
├── plugin.template.json           # source manifest with build placeholders
└── dist-plugin/                   # generated installable package; do not hand-edit
```

## Quick start

```bash
cp -R tools/plugin-templates/visual-process-ts-go ~/Developer/my-mincode-plugin
cd ~/Developer/my-mincode-plugin
pnpm install
pnpm verify
```

Or create it with `mincode plugin create ./my-plugin --template visual-process-ts-go --id example.ui`. `pnpm verify` runs Go unit tests, an executable-level JSON-RPC protocol test, `tsc` type checking, the UI/backend build and package-limit checks. Install the generated absolute `dist-plugin` directory from **Plugin Management**, review the read-only preflight, confirm, and enable it.

To iterate on the page without the desktop app, run the devkit mock host against the built package: `node <devkit>/bin/mincode.mjs mock-host dist-plugin`. It uses the same sandbox and handshake and lets you switch theme and locale. Finish with a desktop smoke test.

## The framework-neutral UI core

`src/mincode/` is the **core** distribution of the shared MinCode plugin UI (the Vue template carries the full one):

- `transport.js` / `transport.d.ts`: the only bridge to the host — `call`, long `tasks`, trusted `confirm`, `clipboard`, `configuration`, bound `document`, `pickPath`, visibility and more.
- `tasks.mjs`: `runTask`, `runTaskOrCall`, `runAIAction` polling helpers.
- `theme.css`: the host's `--app-*` semantic variables for every built-in light and dark theme, generated from the host foundation stylesheet, plus thin scrollbars. Set `data-theme` from `applyContext`; contributed theme tokens are applied by the transport automatically.

Update it from a newer devkit with `node <devkit>/tools/sync-plugin-ui.mjs --core --source <devkit>/sdk/plugin-ui-core src/mincode` (add `--check` to only check). Local edits are refused.

## Using another framework

Keep `src/mincode/`, `src/transport.ts` and the `./mincode/theme.css` import. Add the framework and its Vite plugin as dependencies, register the plugin in `vite.config.ts`, and replace `src/main.ts` with your app entry. For React, for example, add `react`, `react-dom` and `@vitejs/plugin-react`, then mount your root component into `#app` and create the transport once.

## Rules that still apply

Framework freedom does not change the boundary. See section 0.6 of the plugin development guide:

- Bundle every script, style, font and image into `ui/`; no CDN or remote loading. WebAssembly UIs are not supported yet: the host does not serve `.wasm` and its CSP does not allow compiling WebAssembly.
- Talk to MinCode only through the transport; do not access the parent page or Wails bindings.
- The frame has no `allow-forms` or `allow-same-origin`: native form submission is dropped and `localStorage`/cookies are unavailable. Handle button clicks and Enter yourself; persist data through host storage capabilities.
- `write`/`dangerous` actions are confirmed by the host; page dialogs never replace that.
- Follow `data-theme`, `--app-*` variables and locale changes without reloading; ship zh/en copy.
- Keep focus visible, controls keyboard-operable and the page usable at narrow widths; render untrusted data as text, not HTML.

The Go backend, SDK update workflow and dependency guidance are the same as the Vue + Go template; see its README.
