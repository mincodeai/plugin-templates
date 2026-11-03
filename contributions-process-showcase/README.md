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
| `languageFeatures` | 动作 `language.mcdemo`（`read`） | 不用启动语言服务器的轻量语言功能：悬停关键字显示说明、悬停任务名显示所在行；补全给出关键字和文件中 `x = …` 定义的变量；光标在任务名上按 F12（或 Cmd/Ctrl+点击）跳到同一文件的 `task <名>` 行；大纲与面包屑列出每个 `task` 及其中的 `when` 块（宿主 0.3.0 起） |
| `testProviders` | 动作 `tests.discover`（`read`）、`tests.run`（`write`） | 侧栏“测试”标签中的“mcdemo 任务”：每个 `.mcdemo` 文件是一组，每个 `task` 是一个测试。演示规则：`skip-`/`wip-` 开头跳过，没有 `run` 行算出错，含 `TODO` 或 `run "false"` 算失败，其余通过 |
| `settingsPages` | 视图 `settings`（`ui/settings.html`）、动作 `settings.state`（`read`）、`notify.demo`（`read`） | “设置 → 插件 → Process Contributions Showcase”里的“示例设置”页面：显示计数器、演示模式和页面所在位置（`surface` 为 `settings`），可以发送带按钮的通知（立即或 5 秒后）。同一视图也能用命令“打开设置页面”作为标签页打开（宿主 0.3.0 起） |
| `menus.tray` | 命令 `contributions-process-showcase.toggle`（`write`）、`contributions-process-showcase.openSettings`（视图） | 系统托盘菜单“退出”下方的“Process Contributions Showcase”子菜单：“切换演示模式”和“打开设置页面”（宿主 0.3.0 起） |
| `host.notify` 的 `actions` | 命令 `contributions-process-showcase.show`（`read`）、`contributions-process-showcase.reset`（`dangerous`） | “切换演示模式”和设置页按钮发出的通知在通知中心带两个按钮：“查看”直接运行，“重置”先弹出确认框（宿主 0.3.0 起；旧宿主只显示通知） |
| `sessionSources` | 动作 `sessions.read`（`read`） | 会话页（CC 会话）来源列表末尾“插件来源”下的“示例会话”：展开才列出会话（来自插件自己的存储，没有存储时是 3 个示例），点击会话读取消息；其中一条消息含 `<b>` 和 Markdown 链接，演示它们按原文显示（宿主 0.3.0 起） |
| `scmCommitMessage` | 动作 `commit.draft`（`read`） | Git 提交框的“插件生成”：按暂存文件的状态拼出 `chore(showcase): update N files` 和各状态的数量，只填进输入框（宿主 0.3.0 起） |
| `fileDecorations` | 动作 `decorations.read`（`read`）、命令 `showcase.refreshDecorations`（`read`） | 项目文件树上 `.md` 文件名后显示信息色的 `M`，`TODO` 文件显示警告色圆点；命令“刷新文件标记”调用 `host.decorations.refresh` 让资源树重新请求（宿主 0.3.0 起） |

`mcdemo` 语言由 `contributions-showcase` 模板注册；想试用格式化程序、代码检查、语言服务器或轻量语言功能，请同时安装该模板。

本模板声明了 `shell` 与 `workspace.read` 能力：`shell` 是任务和语言服务器的前提（二者首次运行前都会展示完整命令行并要求确认），`workspace.read` 让检查程序收到项目内相对路径、让任务检测收到项目根目录 `project.root`。安装预览会列出这两项能力；不需要这些贡献点时请从清单中删掉对应能力。另外声明的 `notifications` 只用于 `host.notify`（每分钟最多 10 条），`ui` 用于设置页视图。`scmCommitMessage` 与 `fileDecorations` 要求 `workspace.read`（安装时检查）；`sessionSources` 不要求能力，但只有声明了 `workspace.read` 的插件在“当前工作区”范围下才会收到项目根目录。

### 目录结构

```text
contributions-process-showcase/
├── plugin.json        # 清单（API v2，process）
├── bin/
│   ├── plugin.mjs     # 入口（必须可执行）：format、lint、palette.search、ai.context、tasks.detect、tree.mcdemo、language.mcdemo（悬停、补全、跳转定义、大纲）、tests.*、sessions.read、commit.draft、decorations.read、decorations.refresh、show、dashboard.summary、bump、toggle、reset、settings.state、notify.demo
│   ├── format.mjs     # 纯格式化逻辑
│   ├── lint.mjs       # 纯检查规则与关键字说明（lint 动作和语言服务器共用）
│   └── providers.mjs  # 树视图、轻量语言功能（含文档符号与定义）和测试提供程序（扫描项目中的 .mcdemo 文件）
├── lib/
│   ├── runtime.mjs    # 同步自 packages/plugin-sdk/node/runtime.mjs，不要手改
│   └── mcdemo-lsp.mjs # 无依赖的 LSP 服务器（stdio，Content-Length 分帧）
└── ui/
    ├── settings.html  # 设置页（无构建步骤；插件页面的 CSP 不允许内联脚本和样式）
    ├── settings.js    # 纯 JavaScript 页面逻辑，只经 ./mincode/transport.js 调用宿主
    ├── settings.css
    └── mincode/       # 同步自 MinCode 的插件 UI 核心（transport、主题变量），不要手改
```

### 快速开始

1. 把本目录复制到 MinCode 仓库之外并改名，在 `plugin.json` 中修改唯一的 `id`，命令 ID、引导步骤和托盘菜单里的 `command` 以及 `bin/plugin.mjs` 中通知按钮的 `command` 同步改名。
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
   - 在 `.mcdemo` 文件中悬停关键字或任务名，按 Ctrl+Space 触发补全；把光标放在 `run` 行或注释里出现的任务名上按 F12 跳到该任务；打开项目侧栏的「大纲」查看任务与 `when` 块（这两项需要 MinCode 0.3.0 及以上，且文件要在已打开的项目里）；
   - 打开侧栏“测试”标签（打开时自动发现测试），点击“全部运行”或单个测试的“运行”（`tests.run` 是 `write` 风险，本次会话第一次运行前会确认），查看各测试状态和输出。
6. 设置页、托盘与通知按钮（都需要 MinCode 0.3.0 及以上）：
   - 打开“设置 → 插件”，在下拉框中选择 Process Contributions Showcase：页面上方是宿主画的说明条（插件名与 ID、“在标签页中打开”），下面是本插件的页面；
   - 打开系统托盘菜单，“退出”下方的“Process Contributions Showcase”子菜单里点击“切换演示模式”：主窗口来到前台并运行命令（`write` 不确认），通知中心出现带“查看”“重置”两个按钮的通知；
   - 点击“查看”直接运行；点击“重置”会先弹出确认框，框里写的是命令标题“进程示例：重置计数器”，不是按钮文字。
7. 会话来源、提交信息与文件标记（都需要 MinCode 0.3.0 及以上；插件日志里每次调用记一行，可以核对 MinCode 什么时候、发来了什么）：
   - 打开会话页（CC 会话），来源列表末尾“插件来源”下展开“示例会话”，点击“消息只按纯文本显示”：`<b>不是粗体</b>` 和 Markdown 链接按原文显示、不能点击；这些会话没有“在终端中继续”、改名和删除；
   - 在 Git 面板暂存几个文件（可以加一个 `.env`），点提交框页眉的“插件生成”：输入框填入 `chore(showcase): update N files`，提示“已排除 1 个敏感文件”，插件日志里的文件列表没有 `.env`；不会自动提交；
   - 在项目文件树中展开含 `.md` 文件的目录：文件名后出现 `M`；名为 `TODO` 的文件后出现一个圆点；命令面板运行“进程示例：刷新文件标记”让资源树重新请求。

### 编写规则

- **设置页**：`settingsPages` 最多 1 项，`view` 必须是本插件的非悬浮视图。宿主在页面上方画自己的说明条，插件改不掉；页面里 `surface()` 为 `settings`，不接收拖放文件，离开设置即销毁（不保存草稿的话内容会丢）。页面不能读写 MinCode 的设置。
- **托盘菜单**：`menus.tray` 每个插件最多 4 项，条目只能有 `command`、`group`、`order`（不能写 `when`），标签就是命令标题。命令自己的 `when` 照常生效，但上下文在插件进程停止（包括空闲停止）时清空，按需启动的插件不要让托盘项依赖它。点击会把主窗口拉到前台，只有 `dangerous` 命令先确认。
- **通知按钮**：`host.notify` 的 `actions` 最多 2 个，`title` ≤ 24 个字符、单行、不能含零宽字符（所以带 ZWJ 的组合 emoji 不行），`command` 只能是本插件的命令，不带参数；任何一项不合规，整个调用返回 `-32602`，通知也不发。非 `read` 命令点击后都要确认，确认框只显示命令标题和插件名。按钮不保存，MinCode 重启后通知还在但没有按钮；系统通知没有按钮。宿主不会传界面语言，所以按钮文字中英文都写。
- **格式化程序**：`action` 必须是本插件风险为 `read` 的动作。输入为 `{formatter, languageId, fileName, relativePath?, text, range?, options: {tabSize, insertSpaces, eol}}`；只有声明了 `workspace.read` 能力才会收到 `relativePath`（本模板不声明），永远不会收到绝对路径。输出必须恰好是 `{"text": 完整文档}` 或 `{"unchanged": true}`；即使只格式化选区，也要返回整个文档。请求 ≤ 256 KiB，超时 10 秒（保存时 3 秒）。
- **数据小组件**：宿主以固定载荷 `{"widget": id}` 调用 `read` 动作，结果为 `{items: [{label, value, severity?, hint?}]（最多 8 项）, footnote?, updatedAt?}`，≤ 16 KiB，以纯文本显示。宿主不会传入界面语言，所以本模板的标签同时写中英文。`refreshSeconds` 为 0（只手动刷新）或 60–3600。
- **引导中的命令步骤**：`command` 只能是本插件自己的 `contributes.commands`，按命令的风险走正常确认；声明式插件不能使用。
- **代码检查**：输入为 `{linter, languageId, fileName, relativePath?, text, trigger}`，输出必须恰好是 `{"diagnostics": [...]}`，行列从 1 开始（列按 UTF-16 计），`severity` 为 `error`/`warning`/`info`/`hint`，最多 500 条。只有声明了 `type` 触发器才能设置 `debounceMs`（300–5000）。
- **搜索提供者**：输入 `{provider, query, locale}`，宿主不做过滤，由插件自己匹配；输出 `{items: [{id, title, detail?, target}]}`，`target` 可以是本插件视图、本插件 `read` 风险命令或 http/https 地址。前缀不能使用保留词。
- **AI 上下文提供者**：输入 `{provider, argument?, locale}`，永远不包含对话、文档或选区；输出恰好是 `{text, title?, truncated?}`。该动作不能设置 `aiCallable: true`，模型无法调用它。
- **深度链接**：命令目标必须是 `read` 风险命令，路径中不能有参数；每次打开链接都会弹出宿主确认框，任何审批模式都不能跳过。
- **任务**：静态任务的 `command` 只能是裸程序名或 `${pluginRoot}/…`，`cwd` 只能是 `${projectRoot}` 或其子目录；检测动作只在用户点击时运行，结果会被宿主重新校验（id 为 `^[a-z0-9][a-z0-9:._-]{0,63}$`，最多 64 个）。首次运行每个任务都要确认完整命令行。
- **语言服务器**：插件服务器默认不运行，在项目中启用时确认命令行、环境变量和插件文件哈希；服务器在项目根目录运行，通过 stdin/stdout 使用标准 LSP 分帧。
- **树视图、轻量语言功能与测试提供程序**：输入输出格式与限制见 `docs/development/plugin-development.md`。本模板的处理函数只读取 `project.root` 下的 `.mcdemo` 文件，并限制扫描深度、文件数和文件大小；树节点 id 与测试 id 都使用相对路径，宿主会拒绝越界的路径。`language.mcdemo` 的定义只返回当前文档内的位置（省略 `path`），所以不依赖 `workspace.read`；大纲每个节点都是单行纯文本。`definition`、`documentSymbol` 等新种类只对已打开项目里的文件生效，用到它们的发布需要宿主 0.3.0 及以上（只用 `hover`、`completion` 时仍是 0.1.0）。
- **会话来源**：`sessionSources` 每个插件最多 2 项，`action` 必须是本插件 `read` 风险、不能 `aiCallable` 的动作（本模板另设 `uiCallable: false`）。同一动作按 `request` 回答两种请求：`{source, request: "list", scope, project?, locale}` → `{sessions: [{id, title?, detail?, model?, lastAt?, messageCount?}]}`（宿主最多保留 200 个，按插件给出的顺序），`{source, request: "messages", session, locale}` → `{messages: [{role, text, timestamp?, model?}]}`（`role` 为 `user`、`assistant`、`system`、`tool`，宿主保留最后 200 条，每条 ≤ 32 768 字符）。所有文本按纯文本显示，不渲染 Markdown 或 HTML；会话只读，不能续聊、改名或删除。只展示本插件自己的数据，不要读取其他工具的会话目录。
- **提交信息**：`scmCommitMessage` 每个插件最多 1 项，需要 `workspace.read`。只在用户点“插件生成”时调用，载荷是暂存区改动：`files`（≤ 500）和 `diff`（≤ 64 KiB），`.env`、私钥等敏感文件连名字都不发，只计入 `omittedFiles`。返回 `{"message": 字符串}`（≤ 4096 字符），只填进提交框，用户在等待期间改过草稿就不覆盖，MinCode 从不替用户提交。
- **文件标记**：`fileDecorations` 每个插件最多 1 项，需要 `workspace.read`。宿主每次只问一个目录（`directory` 为 `""` 表示项目根）和其中的文件名（≤ 500 个，敏感名称已剔除），只接受请求里出现过的名称。每项 `{badge?, color?, tooltip?}`：`badge` 1–2 个可见字符，`color` 只能是 `accent`、`success`、`warning`、`danger`、`info`、`muted` 之一（不接受 CSS 颜色），`tooltip` 单行 ≤ 128 字符；文件名本身的样式不会变。超时 3 秒，连续 3 次失败暂停 60 秒。`host.decorations.refresh` 不带数据，每 2 秒最多生效一次，旧宿主返回 `-32601`（SDK 视为 `{scheduled: false}`）。
- **并发**：Node SDK 一次只处理一个动作，重叠的调用会立即收到 `-32029`“正在运行”错误。代码检查、搜索、AI 上下文、任务检测和小组件可能同时到达，所以这些处理函数都应保持快速、避免反向调用宿主（本模板只有 `show`、小组件、计数器与演示模式命令和设置页的动作读取存储）。编辑器会在你悬停或跳转的同时自己请求大纲，所以本模板把无状态的 `language.mcdemo` 放进 `start()` 的 `concurrentActions`，让它不受串行限制；只读的 `sessions.read`、`commit.draft`、`decorations.read` 也放在里面，展开目录时的装饰请求不会因为代码检查正在运行而失败。

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
| `languageFeatures` | action `language.mcdemo` (`read`) | Lightweight language features without a language server: hovering a keyword shows its help and hovering a task name shows its line; completion offers keywords and variables defined by `x = …` lines; F12 (or Cmd/Ctrl+click) on a task name goes to its `task <name>` line in the same file; the outline and breadcrumbs list every `task` and the `when` blocks inside it (host 0.3.0+) |
| `testProviders` | actions `tests.discover` (`read`) and `tests.run` (`write`) | “mcdemo tasks” in the sidebar's Tests tab: each `.mcdemo` file is a group and each `task` is a test. Demo rules: names starting with `skip-`/`wip-` are skipped, a task without a `run` line errors, `TODO` or `run "false"` fails, everything else passes |
| `settingsPages` | view `settings` (`ui/settings.html`), actions `settings.state` (`read`) and `notify.demo` (`read`) | A “Demo settings” page under Settings → Plugins → Process Contributions Showcase: shows the counter, demo mode and where the page is shown (`surface` is `settings`), and sends a notification with buttons (now or after 5 seconds). The command Open Settings Page opens the same view as a tab (host 0.3.0+) |
| `menus.tray` | commands `contributions-process-showcase.toggle` (`write`) and `contributions-process-showcase.openSettings` (view) | A “Process Contributions Showcase” submenu below Quit in the system tray menu with Toggle Demo Mode and Open Settings Page (host 0.3.0+) |
| `host.notify` `actions` | commands `contributions-process-showcase.show` (`read`) and `contributions-process-showcase.reset` (`dangerous`) | Notifications from Toggle Demo Mode and the settings page carry two buttons in the notification center: Show runs at once, Reset asks first (host 0.3.0+; older hosts show the notification without buttons) |
| `sessionSources` | action `sessions.read` (`read`) | “Showcase sessions” under Plugin sources at the end of the source list on the sessions page (Codex / CC Sessions): sessions are listed only when expanded (from the plugin's own storage, or 3 demos when nothing is stored) and messages are read when a session is opened; one message contains `<b>` and a Markdown link to show that they stay as typed (host 0.3.0+) |
| `scmCommitMessage` | action `commit.draft` (`read`) | Plugin Generate in the Git commit box: builds `chore(showcase): update N files` and a count per status from the staged files and only fills the message box (host 0.3.0+) |
| `fileDecorations` | action `decorations.read` (`read`), command `showcase.refreshDecorations` (`read`) | In the project tree, `.md` files get an info-coloured `M` after their name and `TODO` files a warning dot; the Refresh File Markers command calls `host.decorations.refresh` so the tree asks again (host 0.3.0+) |

The `mcdemo` language is registered by the `contributions-showcase` template; install it too to try the formatter, the linter, the language server, or the lightweight language features.

This template declares the `shell` and `workspace.read` capabilities. `shell` is required for tasks and language servers, and both show the full command line for confirmation before they first run. `workspace.read` gives the linter the project-relative path and gives task detection the project root (`project.root`). The install preview lists both capabilities; remove them from the manifest if you drop those points. `notifications` is declared for `host.notify` only (at most 10 per minute), and `ui` for the settings page view. `scmCommitMessage` and `fileDecorations` require `workspace.read` (checked at install); `sessionSources` requires no capability, but only a plugin with `workspace.read` receives the project root for the current-workspace scope.

### Layout

```text
contributions-process-showcase/
├── plugin.json        # manifest (API v2, process)
├── bin/
│   ├── plugin.mjs     # entry (must be executable): format, lint, palette.search, ai.context, tasks.detect, tree.mcdemo, language.mcdemo (hover, completion, definition, outline), tests.*, sessions.read, commit.draft, decorations.read, decorations.refresh, show, dashboard.summary, bump, toggle, reset, settings.state, notify.demo
│   ├── format.mjs     # pure formatting logic
│   ├── lint.mjs       # pure lint rules and keyword help (shared by the lint action and the language server)
│   └── providers.mjs  # tree view, lightweight language features (with document symbols and definitions), and test provider (scans the project's .mcdemo files)
├── lib/
│   ├── runtime.mjs    # synchronized from packages/plugin-sdk/node/runtime.mjs; do not edit
│   └── mcdemo-lsp.mjs # dependency-free LSP server (stdio, Content-Length framing)
└── ui/
    ├── settings.html  # the settings page (no build step; the plugin page CSP allows no inline script or style)
    ├── settings.js    # plain JavaScript page logic; talks to MinCode only through ./mincode/transport.js
    ├── settings.css
    └── mincode/       # MinCode plugin UI core (transport, theme variables), synchronized from MinCode; do not edit
```

### Quick start

1. Copy this directory outside the MinCode repository and rename it. Set a unique `id` in `plugin.json` and rename the command IDs, the walkthrough step's and the tray items' `command`, and the notification buttons' `command` in `bin/plugin.mjs` to match.
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
   - hover a keyword or task name in a `.mcdemo` file, and press Ctrl+Space for completion; put the cursor on a task name in a `run` line or a comment and press F12 to go to that task; open the project sidebar's Outline to see the tasks and their `when` blocks (both need MinCode 0.3.0 or later and a file inside an open project);
   - open the sidebar's Tests tab (tests are discovered when it opens), then choose Run all or a single test's Run (`tests.run` is a `write` action, so the first run in each app session is confirmed) and check each status and the output.
6. Settings page, tray and notification buttons (all need MinCode 0.3.0 or later):
   - open Settings → Plugins and pick Process Contributions Showcase: a host-drawn header (plugin name and ID, Open in tab) sits above this plugin's page;
   - open the system tray menu and choose Toggle Demo Mode in the “Process Contributions Showcase” submenu below Quit: the main window comes to the front and runs the command (`write`, no confirmation), and the notification center shows a notification with Show and Reset buttons;
   - Show runs at once; Reset asks first, and the dialog names the command title “Process Showcase: Reset Counter”, not the button text.
7. Session source, commit message and file markers (all need MinCode 0.3.0 or later; each call writes one line to the plugin log, so you can check when MinCode called and what it sent):
   - open the sessions page (Codex / CC Sessions), expand “Showcase sessions” under Plugin sources at the end of the source list and open “Messages are plain text”: `<b>not bold</b>` and the Markdown link appear as typed and cannot be clicked; these sessions have no Continue in terminal, rename or delete;
   - stage a few files in the Git panel (add a `.env` too) and press Plugin Generate in the commit box header: the message box gets `chore(showcase): update N files`, a notice says “1 sensitive file(s) excluded”, and the file list in the plugin log has no `.env`; nothing is committed;
   - expand a folder with `.md` files in the project tree: an `M` follows their names; a file named `TODO` gets a dot; run “Process Showcase: Refresh File Markers” from the command palette to make the tree ask again.

### Authoring rules

- **Settings pages**: `settingsPages` has at most one entry, and `view` must be one of the plugin's non-floating views. The host draws its own header above the page, which the plugin cannot change; inside, `surface()` is `settings`, dropped files are not delivered, and leaving Settings destroys the page (unsaved input is lost). The page cannot read or change MinCode settings.
- **Tray menu**: `menus.tray` has at most 4 items per plugin, each with only `command`, `group` and `order` (no `when`); the label is the command title. The command's own `when` still applies, but context is cleared whenever the plugin process stops (idle stop included), so an on-demand plugin should not make tray items depend on it. A click brings the main window to the front; only `dangerous` commands ask first.
- **Notification buttons**: `host.notify` takes at most 2 `actions`; `title` is one line of at most 24 characters without zero-width characters (so no ZWJ emoji sequences), and `command` is one of the plugin's own commands, without arguments. If any entry is invalid the whole call fails with `-32602` and nothing is posted. Every non-`read` command asks first, and the dialog shows only the command title and the plugin name. Buttons are not saved: after a MinCode restart the notification is still there without buttons, and system notifications never have buttons. The host does not pass the UI language, so the button text is bilingual.
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
- **Tree views, lightweight language features, and test providers**: see `docs/development/plugin-development.md` for payloads and limits. This template only reads `.mcdemo` files under `project.root`, with caps on scan depth, file count, and file size. Tree node ids and test ids use relative paths, and the host rejects paths that escape the project. `language.mcdemo` returns definitions in the current document only (no `path`), so it does not depend on `workspace.read`; every outline node is single-line plain text. The newer kinds such as `definition` and `documentSymbol` serve only files inside an open project, and a release that uses them needs host 0.3.0 or later (one that uses only `hover` and `completion` still needs 0.1.0).
- **Session sources**: `sessionSources` allows at most 2 entries per plugin, and `action` must be one of the plugin's own `read` actions that is not `aiCallable` (this template also sets `uiCallable: false`). The same action answers both requests: `{source, request: "list", scope, project?, locale}` → `{sessions: [{id, title?, detail?, model?, lastAt?, messageCount?}]}` (the host keeps at most 200, in the plugin's order) and `{source, request: "messages", session, locale}` → `{messages: [{role, text, timestamp?, model?}]}` (`role` is `user`, `assistant`, `system` or `tool`; the host keeps the last 200, each at most 32,768 characters). All text is shown as plain text, never Markdown or HTML; sessions are read only and cannot be resumed, renamed or deleted. Show only the plugin's own data; never read another tool's session folders.
- **Commit messages**: `scmCommitMessage` allows 1 entry per plugin and requires `workspace.read`. It runs only when the user presses Plugin Generate; the payload is the staged changes, `files` (at most 500) and `diff` (at most 64 KiB), and `.env`, private keys and other sensitive files are left out with their names, only counted in `omittedFiles`. Return `{"message": string}` (at most 4096 characters): it only fills the commit box, is not applied when the user edited the draft meanwhile, and MinCode never commits for the user.
- **File markers**: `fileDecorations` allows 1 entry per plugin and requires `workspace.read`. The host asks for one folder at a time (`directory` `""` is the project root) with the names in it (at most 500, sensitive names removed), and accepts only names from the request. Each entry is `{badge?, color?, tooltip?}`: `badge` has 1–2 visible characters, `color` is one of `accent`, `success`, `warning`, `danger`, `info`, `muted` (no CSS colours), `tooltip` is one line of at most 128 characters; the file name itself is never restyled. Timeout 3 seconds; 3 failures in a row pause the provider for 60 seconds. `host.decorations.refresh` carries no data and takes effect at most once every 2 seconds; older hosts answer `-32601`, which the SDK turns into `{scheduled: false}`.
- **Concurrency**: the Node SDK runs one action at a time and answers an overlapping call at once with a `-32029` “already running” error. Lint, search, AI context, task detection, and widget calls can arrive together, so keep those handlers fast and free of host callbacks (in this template only `show`, the widget, the counter and demo-mode commands and the settings page actions read storage). The editor asks for the outline on its own while you hover or jump, so this template lists the stateless `language.mcdemo` in `concurrentActions` of `start()` to take it out of the serial gate. The read-only `sessions.read`, `commit.draft` and `decorations.read` are listed there too, so a decoration request for an expanded folder does not fail while the linter runs.

- **AI catalogs**: `aiCatalogs` declares separate `mcp` and `skill` catalogs. Search receives `{catalog, kind, query, locale}` and returns display-only `{items}`; installation receives `{catalog, kind, id, locale}` and returns `{content}` (MCP JSON or SKILL.md). Both actions must be read-only and not AI-callable. The host never fetches plugin URLs or automatically connects the installed server.
