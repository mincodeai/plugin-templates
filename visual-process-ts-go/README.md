# MinCode TypeScript + Go visual plugin template

A build-first source project for a third-party MinCode visual plugin **without a UI framework**. The page is plain TypeScript and DOM APIs bundled by Vite; the backend is the same isolated Go process as the Vue + Go template. Use it as the starting point for React, Svelte, Solid, plain TypeScript or any other front end that builds to static assets.

MinCode does not run `pnpm install`, `go mod download`, or `go build` while installing a plugin. End users install only `dist-plugin/` and need no Node.js, pnpm, Go, source code, or `node_modules`.

## Project layout

```text
visual-process-ts-go/
├── backend/                       # independent Go module and process runtime
│   └── go.mod                     # requires the published github.com/mincodeai/plugin-sdk-go
├── src/
│   ├── main.ts                    # the page (replace with your framework's entry)
│   ├── styles.css                 # page styles using --app-* theme variables
│   └── transport.ts               # re-exports the bridge and task helpers
├── scripts/                       # build, protocol test, and package verification
├── plugin.template.json           # source manifest with build placeholders
├── package.json                   # depends on the published @mincodeai/plugin-ui
├── mincode.project.json           # template and MinCode version that created the project
└── dist-plugin/                   # generated installable package; do not hand-edit
```

## Quick start

```bash
mincode plugin create ~/Developer/my-mincode-plugin --id my-mincode-plugin --template visual-process-ts-go
cd ~/Developer/my-mincode-plugin
pnpm install
pnpm verify
```

The project depends on the published MinCode modules at the versions recommended by the MinCode release that created it (`github.com/mincodeai/plugin-sdk-go` in `backend/go.mod`, `@mincodeai/plugin-ui` in `package.json`), so the first `pnpm install` and the first backend build need network access to the npm registry and the Go module proxy (the first build runs `go mod tidy` once to create `backend/go.sum`; commit it). Set `GOPROXY` (for example `https://goproxy.cn,direct`) and an npm registry mirror on slow networks. To move to newer versions, change them in `backend/go.mod` (`go get github.com/mincodeai/plugin-sdk-go@vX.Y.Z`) and `package.json`, then re-run `pnpm verify`.

`pnpm verify` runs Go unit tests, an executable-level JSON-RPC protocol test, `tsc` type checking, the UI/backend build and package-limit checks. Install the generated absolute `dist-plugin` directory from **Plugin Management**, review the read-only preflight, confirm, and enable it.

To iterate on the page without the desktop app, run the mock host from the MinCode plugin development kit against the absolute path of the built package: `node tools/mock-host.mjs /absolute/my-plugin/dist-plugin` from the kit root (in the MinCode repository the script is `tools/plugin-devkit/mock-host.mjs`). It uses the same sandbox and handshake and lets you switch theme and locale. Finish with a desktop smoke test.

## The framework-neutral UI core

The page imports the **core** entry points of the `@mincodeai/plugin-ui` package (`@mincodeai/plugin-ui/core/*`, no Vue or Element Plus; the Vue template uses the full ones):

- `transport.js` / `transport.d.ts`: the only bridge to the host — `call`, long `tasks`, trusted `confirm`, `clipboard`, `configuration`, bound `document`, `pickPath`, visibility and more.
- `tasks.mjs`: `runTask`, `runTaskOrCall`, `runAIAction` polling helpers.
- `theme.css`: the host's `--app-*` semantic variables for every built-in light and dark theme, generated from the host foundation stylesheet, plus thin scrollbars. Set `data-theme` from `applyContext`; contributed theme tokens are applied by the transport automatically.

Do not copy or edit the package's files. Projects created by older MinCode versions carry vendored copies in `src/mincode/` and `backend/third_party/plugin-sdk-go/` instead; `mincode plugin upgrade` migrates them to the published modules (removing the copies and aliases, rewriting only the imports that pointed into the copy), and `mincode plugin sync` (`--check` only checks) still updates the copies for projects that are not migrated yet. Both refuse locally edited copy files.

## Using another framework

Keep the `@mincodeai/plugin-ui` dependency, `src/transport.ts` and the `@mincodeai/plugin-ui/core/theme.css` import. Add the framework and its Vite plugin as dependencies, register the plugin in `vite.config.ts`, and replace `src/main.ts` with your app entry. For React, for example, add `react`, `react-dom` and `@vitejs/plugin-react`, then mount your root component into `#app` and create the transport once.

## Rules that still apply

Framework freedom does not change the boundary. See section 0.6 of the plugin development guide:

- Bundle every script, style, font and image into `ui/`; no CDN or remote loading. WebAssembly UIs are not supported yet: the host does not serve `.wasm` and its CSP does not allow compiling WebAssembly.
- Talk to MinCode only through the transport; do not access the parent page or Wails bindings.
- The frame has no `allow-forms` or `allow-same-origin`: native form submission is dropped and `localStorage`/cookies are unavailable. Handle button clicks and Enter yourself; persist data through host storage capabilities.
- `write`/`dangerous` actions are confirmed by the host; page dialogs never replace that.
- Follow `data-theme`, `--app-*` variables and locale changes without reloading; ship zh/en copy.
- Keep focus visible, controls keyboard-operable and the page usable at narrow widths; render untrusted data as text, not HTML.

The Go backend, SDK update workflow and dependency guidance are the same as the Vue + Go template; see its README.
