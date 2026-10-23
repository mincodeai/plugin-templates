# MinCode 进程插件贡献点示例 / Process contributions showcase

[中文](#中文) · [English](#english)

## 中文

这是一个无依赖的 **Node 本地进程插件**模板（清单 API v2），演示只能由进程插件提供的贡献点。纯数据贡献点（语言、片段、JSON 校验、命令片段、HTTP 集合、文件模板、终端链接、纯文本引导等）见声明式模板 `contributions-showcase`。

| 贡献点 | 相关动作 / 命令 | 效果 |
| --- | --- | --- |
| `formatters` | 动作 `format`（`read`） | `mcdemo` 语言的格式化程序：去掉行尾空白，按 `options.tabSize` / `insertSpaces` 重新缩进 `task`、`when`、`else`、`end` 块，支持“格式化选定内容” |
| `dashboardWidgets`（`kind: "data"`） | 动作 `dashboard.summary`（`read`） | 仪表盘卡片“示例计数器”，显示存储在插件 KV 中的计数，可见时每 60 秒刷新 |
| `walkthroughs` | 命令 `contributions-process-showcase.bump`（`write`） | 精选引导“进程插件贡献点”，第二步带 `command`，点击后运行本插件的“计数器加一”命令 |
| `linters` | 动作 `lint`（`read`） | `mcdemo` 代码检查：`TODO` 标为信息，行尾空白与超过 120 个字符的行标为警告；支持打开、保存和输入时（750 ms 防抖）检查 |
| `searchProviders` | 动作 `palette.search`（`read`） | 命令面板输入 `demo:` 后显示两条静态结果：运行只读命令“查看计数器”，或在系统浏览器中打开 `https://example.com/mincode/plugins` |
| `aiContextProviders` | 动作 `ai.context`（`read`） | AI 输入框中的 `@demo`：可选填一个主题，获取 mcdemo 语言与检查规则的简要说明，预览确认后作为上下文插入 |
| `uriHandlers` | 命令 `contributions-process-showcase.show`（`read`） | 打开 `mincode://contributions-process-showcase/counter/show` 时，宿主确认后运行“查看计数器”命令 |
| `tasks` | 动作 `tasks.detect`（`read`） | 静态任务“Node.js 版本”（项目有 `package.json` 时列出，运行 `node --version`）；检测提供程序 `npm` 读取项目根目录 `package.json` 的 `scripts`，生成 `npm run <脚本>` 任务 |
| `languageServers` | `lib/mcdemo-lsp.mjs` | 无依赖的 `mcdemo` LSP 服务器（`node ${pluginRoot}/lib/mcdemo-lsp.mjs --stdio`）：与 `lint` 相同规则的诊断、关键字补全和悬停说明 |
| `treeViews` | 动作 `tree.mcdemo`（`read`） | 侧栏“视图”标签中的“mcdemo 文件”树：第一层是“链接”（运行“查看计数器”命令、打开示例网址）和项目中每个 `.mcdemo` 文件，展开文件列出其中的 `task`，点击跳转到对应行 |
| `languageFeatures` | 动作 `language.mcdemo`（`read`） | 不用启动语言服务器的轻量悬停与补全：悬停关键字显示说明、悬停任务名显示所在行；补全给出关键字和文件中 `x = …` 定义的变量 |
| `testProviders` | 动作 `tests.discover`（`read`）、`tests.run`（`write`） | 侧栏“测试”标签中的“mcdemo 任务”：每个 `.mcdemo` 文件是一组，每个 `task` 是一个测试。演示规则：`skip-`/`wip-` 开头跳过，没有 `run` 行算出错，含 `TODO` 或 `run "false"` 算失败，其余通过 |

`mcdemo` 语言由 `contributions-showcase` 模板注册；想试用格式化程序、代码检查、语言服务器或轻量语言功能，请同时安装该模板。

本模板声明了 `shell` 与 `workspace.read` 能力：`shell` 是任务和语言服务器的前提（二者首次运行前都会展示完整命令行并要求确认），`workspace.read` 让检查程序收到项目内相对路径、让任务检测收到项目根目录 `project.root`。安装预览会列出这两项能力；不需要这些贡献点时请从清单中删掉对应能力。

### 目录结构

```text
contributions-process-showcase/
├── plugin.json        # 清单（API v2，process）
├── bin/
│   ├── plugin.mjs     # 入口（必须可执行）：format、lint、palette.search、ai.context、tasks.detect、tree.mcdemo、language.mcdemo、tests.*、show、dashboard.summary、bump
│   ├── format.mjs     # 纯格式化逻辑
│   ├── lint.mjs       # 纯检查规则与关键字说明（lint 动作和语言服务器共用）
│   └── providers.mjs  # 树视图、轻量语言功能和测试提供程序（扫描项目中的 .mcdemo 文件）
└── lib/
    ├── runtime.mjs    # 同步自 packages/plugin-sdk/node/runtime.mjs，不要手改
    └── mcdemo-lsp.mjs # 无依赖的 LSP 服务器（stdio，Content-Length 分帧）
```

### 快速开始

1. 把本目录复制到 MinCode 仓库之外并改名，在 `plugin.json` 中修改唯一的 `id`，命令 ID 与引导步骤里的 `command` 同步改名。
2. 校验：`mincode plugin verify ./contributions-process-showcase`。
3. 在 **插件管理** 中按目录安装并启用。打开仪表盘的“开始使用”区域查看引导；在 `.mcdemo` 文件的右键菜单中选择“使用…格式化文档”。
4. 其余贡献点都需要用户主动开启或触发：
   - 在“设置 > 通用 > 插件代码检查”中为 `mcdemo` 选择“MinCode Demo 代码检查”（可另外勾选输入时检查）；
   - 在命令面板输入 `demo:`；在 AI 输入框输入 `@demo` 并点击“获取”；
   - 在终端执行 `open 'mincode://contributions-process-showcase/counter/show'`（macOS）并在确认框中确认；
   - 在带 `package.json` 的项目侧栏“任务”标签中点击“检测任务”，确认后运行；
   - 在项目的“语言服务器”对话框中启用“MinCode Demo 语言服务器”并确认命令行。
5. 打开一个包含 `.mcdemo` 文件的项目（可以复制 `contributions-showcase/example.mcdemo`，再加上 `skip-` 开头的任务、含 `TODO` 的任务和没有 `run` 行的任务）：
   - 侧栏“视图”标签中展开“mcdemo 文件”，点击任务跳转到文件对应行；
   - 在 `.mcdemo` 文件中悬停关键字或任务名，按 Ctrl+Space 触发补全；
   - 打开侧栏“测试”标签（打开时自动发现测试），点击“全部运行”或单个测试的“运行”（`tests.run` 是 `write` 风险，本次会话第一次运行前会确认），查看各测试状态和输出。

### 编写规则

- **格式化程序**：`action` 必须是本插件风险为 `read` 的动作。输入为 `{formatter, languageId, fileName, relativePath?, text, range?, options: {tabSize, insertSpaces, eol}}`；只有声明了 `workspace.read` 能力才会收到 `relativePath`（本模板不声明），永远不会收到绝对路径。输出必须恰好是 `{"text": 完整文档}` 或 `{"unchanged": true}`；即使只格式化选区，也要返回整个文档。请求 ≤ 256 KiB，超时 10 秒（保存时 3 秒）。
- **数据小组件**：宿主以固定载荷 `{"widget": id}` 调用 `read` 动作，结果为 `{items: [{label, value, severity?, hint?}]（最多 8 项）, footnote?, updatedAt?}`，≤ 16 KiB，以纯文本显示。宿主不会传入界面语言，所以本模板的标签同时写中英文。`refreshSeconds` 为 0（只手动刷新）或 60–3600。
- **引导中的命令步骤**：`command` 只能是本插件自己的 `contributes.commands`，按命令的风险走正常确认；声明式插件不能使用。
- **代码检查**：输入为 `{linter, languageId, fileName, relativePath?, text, trigger}`，输出必须恰好是 `{"diagnostics": [...]}`，行列从 1 开始（列按 UTF-16 计），`severity` 为 `error`/`warning`/`info`/`hint`，最多 500 条。只有声明了 `type` 触发器才能设置 `debounceMs`（300–5000）。
- **搜索提供者**：输入 `{provider, query, locale}`，宿主不做过滤，由插件自己匹配；输出 `{items: [{id, title, detail?, target}]}`，`target` 可以是本插件视图、本插件 `read` 风险命令或 http/https 地址。前缀不能使用保留词。
- **AI 上下文提供者**：输入 `{provider, argument?, locale}`，永远不包含对话、文档或选区；输出恰好是 `{text, title?, truncated?}`。该动作不能设置 `aiCallable: true`，模型无法调用它。
- **深度链接**：命令目标必须是 `read` 风险命令，路径中不能有参数；每次打开链接都会弹出宿主确认框，任何审批模式都不能跳过。
- **任务**：静态任务的 `command` 只能是裸程序名或 `${pluginRoot}/…`，`cwd` 只能是 `${projectRoot}` 或其子目录；检测动作只在用户点击时运行，结果会被宿主重新校验（id 为 `^[a-z0-9][a-z0-9:._-]{0,63}$`，最多 64 个）。首次运行每个任务都要确认完整命令行。
- **语言服务器**：插件服务器默认不运行，在项目中启用时确认命令行、环境变量和插件文件哈希；服务器在项目根目录运行，通过 stdin/stdout 使用标准 LSP 分帧。
- **树视图、轻量语言功能与测试提供程序**：输入输出格式与限制见 `docs/development/plugin-development.md`。本模板的处理函数只读取 `project.root` 下的 `.mcdemo` 文件，并限制扫描深度、文件数和文件大小；树节点 id 与测试 id 都使用相对路径，宿主会拒绝越界的路径。
- **并发**：Node SDK 一次只处理一个动作，重叠的调用会立即收到 `-32029`“正在运行”错误。代码检查、搜索、AI 上下文、任务检测和小组件可能同时到达，所以这些处理函数都应保持快速、避免反向调用宿主（本模板只有 `show`、小组件和计数器命令读取存储）。

## English

A dependency-free **Node local process plugin** template (manifest API v2) that shows the contribution points only process plugins can provide. For data-only points (languages, snippets, JSON validation, command snippets, HTTP collections, file templates, terminal links, text walkthroughs, and more) see the declarative `contributions-showcase` template.

| Point | Action / command | Effect |
| --- | --- | --- |
| `formatters` | action `format` (`read`) | A formatter for the `mcdemo` language: trims trailing whitespace and re-indents `task`, `when`, `else`, and `end` blocks using `options.tabSize` / `insertSpaces`; supports Format Selection |
| `dashboardWidgets` (`kind: "data"`) | action `dashboard.summary` (`read`) | A “Showcase counter” dashboard card showing a counter kept in plugin KV, refreshed every 60 seconds while visible |
| `walkthroughs` | command `contributions-process-showcase.bump` (`write`) | The featured “Process contributions” walkthrough; its second step has a `command` that runs this plugin's Increment Counter command |
| `linters` | action `lint` (`read`) | An `mcdemo` linter: `TODO` as info, trailing whitespace and lines over 120 characters as warnings; runs on open, save, and while typing (750 ms debounce) |
| `searchProviders` | action `palette.search` (`read`) | Typing `demo:` in the command palette shows two static results: run the read-only Show Counter command, or open `https://example.com/mincode/plugins` in the system browser |
| `aiContextProviders` | action `ai.context` (`read`) | `@demo` in the AI composer: with an optional topic, fetches a short description of the mcdemo language and its lint rules, inserted as context after preview and confirmation |
| `uriHandlers` | command `contributions-process-showcase.show` (`read`) | Opening `mincode://contributions-process-showcase/counter/show` runs Show Counter after the host confirmation |
| `tasks` | action `tasks.detect` (`read`) | A static “Node.js version” task (listed when the project has `package.json`; runs `node --version`) and an `npm` detection provider that reads `scripts` from the project's `package.json` and offers `npm run <script>` |
| `languageServers` | `lib/mcdemo-lsp.mjs` | A dependency-free `mcdemo` LSP server (`node ${pluginRoot}/lib/mcdemo-lsp.mjs --stdio`): diagnostics with the same rules as `lint`, keyword completion, and hover |
| `treeViews` | action `tree.mcdemo` (`read`) | An “mcdemo files” tree in the sidebar's Views tab. The top level has “Links” (run Show Counter, open the example URL) and every `.mcdemo` file in the project; expanding a file lists its `task` blocks, and clicking one jumps to its line |
| `languageFeatures` | action `language.mcdemo` (`read`) | Lightweight hover and completion without a language server: hovering a keyword shows its help and hovering a task name shows its line; completion offers keywords and variables defined by `x = …` lines |
| `testProviders` | actions `tests.discover` (`read`) and `tests.run` (`write`) | “mcdemo tasks” in the sidebar's Tests tab: each `.mcdemo` file is a group and each `task` is a test. Demo rules: names starting with `skip-`/`wip-` are skipped, a task without a `run` line errors, `TODO` or `run "false"` fails, everything else passes |

The `mcdemo` language is registered by the `contributions-showcase` template; install it too to try the formatter, the linter, the language server, or the lightweight language features.

This template declares the `shell` and `workspace.read` capabilities. `shell` is required for tasks and language servers, and both show the full command line for confirmation before they first run. `workspace.read` gives the linter the project-relative path and gives task detection the project root (`project.root`). The install preview lists both capabilities; remove them from the manifest if you drop those points.

### Layout

```text
contributions-process-showcase/
├── plugin.json        # manifest (API v2, process)
├── bin/
│   ├── plugin.mjs     # entry (must be executable): format, lint, palette.search, ai.context, tasks.detect, tree.mcdemo, language.mcdemo, tests.*, show, dashboard.summary, bump
│   ├── format.mjs     # pure formatting logic
│   ├── lint.mjs       # pure lint rules and keyword help (shared by the lint action and the language server)
│   └── providers.mjs  # tree view, lightweight language features, and test provider (scans the project's .mcdemo files)
└── lib/
    ├── runtime.mjs    # synchronized from packages/plugin-sdk/node/runtime.mjs; do not edit
    └── mcdemo-lsp.mjs # dependency-free LSP server (stdio, Content-Length framing)
```

### Quick start

1. Copy this directory outside the MinCode repository and rename it. Set a unique `id` in `plugin.json` and rename the command ID and the walkthrough step's `command` to match.
2. Verify: `mincode plugin verify ./contributions-process-showcase`.
3. Install the directory in **Plugin Management** and enable it. Open the walkthrough from the dashboard's Get started section, and use Format Document With… from the context menu of a `.mcdemo` file.
4. The other points only run when the user turns them on or triggers them:
   - in **Settings > General > Plugin linters**, pick “MinCode Demo lint” for `mcdemo` (lint-while-typing is a separate opt-in);
   - type `demo:` in the command palette; type `@demo` in the AI composer and choose Fetch;
   - in **Settings > AI > Connectors / Skills > Discover**, search “showcase”, press Add and review the plugin confirmation. The demo HTTP connector is inert until manually connected; no server is bundled. Uninstalling this plugin leaves the added configuration in place; remove it from Settings when finished;
   - run `open 'mincode://contributions-process-showcase/counter/show'` (macOS) and confirm the dialog;
   - in a project with `package.json`, choose Detect tasks in the sidebar's Tasks tab, then confirm a task to run it;
   - enable “MinCode Demo language server” in the project's Language servers dialog and confirm its command line.
5. Open a project that contains `.mcdemo` files (copy `contributions-showcase/example.mcdemo` and add a task starting with `skip-`, a task containing `TODO`, and a task without a `run` line):
   - expand “mcdemo files” in the sidebar's Views tab and click a task to jump to its line;
   - hover a keyword or task name in a `.mcdemo` file, and press Ctrl+Space for completion;
   - open the sidebar's Tests tab (tests are discovered when it opens), then choose Run all or a single test's Run (`tests.run` is a `write` action, so the first run in each app session is confirmed) and check each status and the output.

### Authoring rules

- **Formatters**: `action` must be one of the plugin's own `read` actions.
  - Input: `{formatter, languageId, fileName, relativePath?, text, range?, options: {tabSize, insertSpaces, eol}}`. `relativePath` is sent only when the plugin declares `workspace.read` (this template does not); absolute paths are never sent.
  - Output: exactly `{"text": <whole document>}` or `{"unchanged": true}`. Return the whole document even for a range.
  - Requests are at most 256 KiB, with a 10-second timeout (3 seconds on save).
- **Data widgets**: the host calls a `read` action with the fixed payload `{"widget": id}`. The result is `{items: [{label, value, severity?, hint?}] (at most 8), footnote?, updatedAt?}`, at most 16 KiB, rendered as plain text. The host does not pass the UI language, so this template's labels are bilingual. `refreshSeconds` is 0 (manual only) or 60–3600.
- **Walkthrough command steps**: `command` must be one of the plugin's own `contributes.commands` and goes through the command's normal risk confirmation. Declarative plugins cannot use it.
- **Linters**: input `{linter, languageId, fileName, relativePath?, text, trigger}`; output exactly `{"diagnostics": [...]}` with 1-based lines and columns (UTF-16 columns), `severity` `error`/`warning`/`info`/`hint`, at most 500 entries. `debounceMs` (300–5000) is allowed only with the `type` trigger.
- **Search providers**: input `{provider, query, locale}`. The host does not filter, so the plugin matches the query itself. Output `{items: [{id, title, detail?, target}]}`, where `target` is one of the plugin's views, one of its `read` commands, or an http/https URL. Reserved prefixes are rejected.
- **AI context providers**: input `{provider, argument?, locale}`, which never includes the conversation, documents, or selections. Output is exactly `{text, title?, truncated?}`. The action must not set `aiCallable: true`, so the model can never call it.
- **Deep links**: a command target must be a `read` command and its path has no parameters. Every link opens a host confirmation that no approval mode can skip.
- **Tasks**: a static task's `command` is a bare program name or `${pluginRoot}/…`, and `cwd` is `${projectRoot}` or a folder inside it. Detection runs only when the user asks, and the host re-validates the result (ids match `^[a-z0-9][a-z0-9:._-]{0,63}$`, at most 64 tasks). Each task's full command line is confirmed before its first run.
- **Language servers**: plugin servers never run by default. Enabling one in a project confirms its command line, environment, and plugin file hashes. The server runs in the project root and speaks standard LSP framing over stdin/stdout.
- **Tree views, lightweight language features, and test providers**: see `docs/development/plugin-development.md` for payloads and limits. This template only reads `.mcdemo` files under `project.root`, with caps on scan depth, file count, and file size. Tree node ids and test ids use relative paths, and the host rejects paths that escape the project.
- **Concurrency**: the Node SDK runs one action at a time and answers an overlapping call at once with a `-32029` “already running” error. Lint, search, AI context, task detection, and widget calls can arrive together, so keep those handlers fast and free of host callbacks (in this template only `show`, the widget, and the counter command read storage).

- **AI catalogs**: `aiCatalogs` declares separate `mcp` and `skill` catalogs. Search receives `{catalog, kind, query, locale}` and returns display-only `{items}`; installation receives `{catalog, kind, id, locale}` and returns `{content}` (MCP JSON or SKILL.md). Both actions must be read-only and not AI-callable. The host never fetches plugin URLs or automatically connects the installed server.
