# MinCode 贡献点示例模板 / Contributions showcase template

[中文](#中文) · [English](#english)

## 中文

这是一个**声明式**（`runtime.type: "declarative"`）MinCode 插件模板，演示如何只用 JSON / Markdown 文件扩展编辑器与 AI：

| 贡献点 | 文件 | 效果 |
| --- | --- | --- |
| `languages` | `languages/mcdemo.monarch.json`、`languages/mcdemo.language-configuration.json` | 为虚构的 `.mcdemo` 格式注册语言 `mcdemo`：Monarch 语法高亮、`#` 行注释、括号匹配、自动闭合与缩进规则 |
| `snippets` | `snippets/mcdemo.json` | 为 `mcdemo` 语言提供 `task`、`when`、`set` 三个代码片段 |
| `aiPrompts`（`kind: "prompt"`） | `plugin.json` 内联 `template` | 使用 `{{selection}}`、`{{language}}`、`{{file}}` 占位符解释选中的代码 |
| `aiPrompts`（`kind: "skill"`） | `skills/mcdemo-style.md` | 供 AI 会话加载的 `.mcdemo` 风格指南 |
| `localizations` | `l10n/messages.ja.json` | 演示用的日语（`ja`）界面语言包，只翻译侧边栏与命令面板的少量宿主文案，其余回退到用户选择的简体中文或 English |
| `fileIcons` | `plugin.json` 内联主题 + `fileicons/*.svg` | 文件图标主题 `contributions-showcase.demo`：默认文件、文件夹（折叠/展开）与 `.mcdemo` 图标，浅色主题下 `.mcdemo` 使用深一些的变体 |
| `jsonValidation` | `schemas/mcdemo-config.schema.json` | 编辑器打开 `mcdemo.config.json` 时按该 JSON Schema 提供补全、悬停说明和错误提示 |
| `commandSnippets` | `commands/mcdemo.json` | 终端命令片段库“MinCode Demo”：带变量 `dir` 的单行命令和一个多行命令；片段只插入到提示符，从不自动执行 |
| `httpCollections` | `http/mcdemo-api.json` | HTTP 请求集合模板：使用 `{{baseUrl}}`、`{{token}}` 变量和 Local 环境，用户导入副本或打开为草稿，不会自动发送 |
| `fileTemplates` | `templates/**/*.tmpl` | “新建文件”模板 `{{mincode.name}}.mcdemo`，以及包含 README、`src/main.mcdemo` 和 `mcdemo.config.json` 的“新建项目”模板 |
| `terminalLinks` | `plugin.json` 内联 | 终端输出中的 `MCDEMO-123` 链接到 `https://example.com/issues/123`；本地终端中的 `path.mcdemo:12` 可点击打开已保存本地项目中的文件并跳到该行 |
| `terminalColorSchemes` | `terminal-schemes/mcdemo-dark.json`、`terminal-schemes/mcdemo-light.json` | 两套终端配色“MinCode Demo 深色/浅色”，在“设置 → 终端 → 配色方案”的“插件配色”分组中选择后才生效 |
| `httpCodeGenerators` | `assets/codegen/httpie.tmpl`、`assets/codegen/python-requests.tmpl` | HTTP 工作区“生成代码”中的 HTTPie（`escape: shell`）与 Python requests（`escape: json`）生成器，由宿主在本地渲染 |
| `walkthroughs` | `plugin.json` 内联 | 精选入门引导“MinCode Demo 入门”，四个纯文本步骤 |

声明式插件没有 `entry`、`capabilities`、`commands`、`views` 或 `actions`，永远不会启动本地进程，始终全局生效，也不占用套餐的插件额度。无需构建，目录本身即可安装。

### 目录结构

```text
contributions-showcase/
├── plugin.json                                  # 清单（API v2，声明式）
├── languages/
│   ├── mcdemo.monarch.json                      # Monarch 语法（必须包含 tokenizer，严格 JSON）
│   └── mcdemo.language-configuration.json       # 语言配置（仅允许白名单字段）
├── snippets/
│   └── mcdemo.json                              # VS Code 兼容的代码片段格式
├── skills/
│   └── mcdemo-style.md                          # AI 技能（Markdown，可带 front matter）
├── l10n/
│   └── messages.ja.json                         # 语言包：扁平的 {"宿主文案键": "译文"}
├── fileicons/
│   ├── file.svg、folder.svg、folder-open.svg    # 默认文件与文件夹图标
│   └── mcdemo.svg、mcdemo-light.svg             # .mcdemo 图标（深色/浅色）
├── schemas/
│   └── mcdemo-config.schema.json                # JSON Schema（严格 JSON，只允许 # 开头的文档内 $ref）
├── commands/
│   └── mcdemo.json                              # 终端命令片段库
├── http/
│   └── mcdemo-api.json                          # mincode.http-collection v1 请求集合
├── templates/
│   ├── file.mcdemo.tmpl                         # 新建文件模板
│   └── project/…                                # 新建项目模板（README、src/main.mcdemo、mcdemo.config.json）
├── terminal-schemes/
│   └── mcdemo-dark.json、mcdemo-light.json      # 终端配色方案（每个文件就是一个完整条目）
├── assets/codegen/
│   └── httpie.tmpl、python-requests.tmpl        # HTTP 代码生成模板（无逻辑 Mustache 子集）
├── mcdemo.config.json                           # 用于试用 JSON 校验的示例配置
└── example.mcdemo                               # 安装后用于试用的示例文件
```

### 快速开始

1. 把本目录复制到 MinCode 仓库之外并改名，然后在 `plugin.json` 中修改唯一的小写 `id`、`name`、`version`、`author`、`category` 与可选 `tags`。
2. 把语言 ID `mcdemo`、扩展名 `.mcdemo` 与各文件换成你自己的格式。语言 ID 不能与 MinCode 已注册的语言冲突（例如 `json`、`sql`、`typescript`）。
3. 校验：

   ```bash
   mincode plugin verify ./contributions-showcase
   ```

4. 在 **插件管理** 中输入目录的绝对路径并选择 **安装**，查看只读预检后确认安装。打开 `example.mcdemo` 即可看到高亮；输入 `task` 触发片段；两个 `aiPrompts` 条目会出现在 AI 助手的输入区，也可以在设置的插件 AI 提示词分区中查看。
5. 语言包与图标主题都不会自动生效：在 **设置 > 通用 > 语言** 中选择“日本語”并指定回退语言，侧边栏等文案即切换为日语；在 **设置 > 通用 > 文件图标主题** 中选择“MinCode Demo 图标”，项目文件树与文档标签页即使用本主题的图标。
6. 其余贡献点：打开 `mcdemo.config.json` 查看结构补全与校验；在终端的命令片段中找到“MinCode Demo 示例”；在 HTTP 工作区导入“MinCode Demo 接口”集合；新建文件或项目时选择“MinCode Demo”分类；在终端输出 `MCDEMO-42` 或 `example.mcdemo:3` 试用链接；在“设置 → 终端 → 配色方案”中选择“MinCode Demo 深色/浅色”；在 HTTP 工作区的“生成代码”对话框中选择 HTTPie 或“Python（requests）”；在仪表盘的“开始使用”区域打开“MinCode Demo 入门”引导。

### 编写规则

- 文件引用只能指向对应贡献点允许的目录：语言文件放在 `languages/`、`syntaxes/` 或 `assets/`，片段放在 `snippets/` 或 `assets/`，提示词与技能放在 `prompts/`、`skills/` 或 `assets/`。路径必须是相对路径，不允许越界或符号链接逃逸。
- Monarch 语法与语言配置中的正则会做灾难性回溯检查；请保持正则简单，避免嵌套量词。
- `aiPrompts` 的 `id` 必须匹配 `^[a-z0-9][a-z0-9-]{0,47}$`；`kind: "skill"` 必须提供 `description`。模板中的 `{{selection}}` 会被截断到宿主限制内，且始终作为不可信内容处理。
- 可见文案可通过 `titleLocalized` / `descriptionLocalized` 提供中文等本地化版本。
- 语言包：`locale` 不能是内置的 `zh`、`en` 及其变体（如 `zh-CN`、`en-US`），文件放在 `l10n/`、`locales/`、`i18n/` 或 `assets/` 下且为严格 JSON。键以宿主 `vue-app/src/i18n/locales/en.ts` 为准，译文中的 `{name}` 占位符必须与原文一致；安全、审批、权限、确认类等受保护文案（如 `common.*`）写了也会被忽略。可选的 `pluginTitles` 只能翻译**其他插件**的命令和视图标题，本插件自己的标题请用 `titleLocalized`，所以本模板没有使用它。
- JSON 校验：`fileMatch` 为相对 glob，必须以 `.json` 或 `.jsonc` 结尾，且文件名在扩展名前至少有 3 个非通配字符（`*.json` 这类会被拒绝）；Schema 放在 `schemas/` 或 `assets/` 下，`$ref` 只能是 `#` 开头的文档内引用，MinCode 从不下载远程 Schema。
- 命令片段：`{{变量}}` 必须在 `variables` 中声明（最多 8 个），`quote: "posix"` 会按 shell 规则给用户输入加引号；`{{.Names}}` 这类非标识符文本原样保留。命令只插入不执行，多行命令需经粘贴确认。
- HTTP 集合：没有认证字段；`Authorization`、`Cookie` 等敏感请求头和名称含敏感字样的变量只能为空或写成单个 `{{变量}}`，看起来像真实凭据的值会被拒绝。
- 文件模板：源文件是 `templates/` 或 `assets/` 下的 `.tmpl`，只能使用 `{{mincode.name}}`、`{{mincode.fileName}}`、`{{mincode.projectName}}`、`{{mincode.date}}`、`{{mincode.year}}` 以及 `nameCamel`、`namePascal`、`nameKebab`、`nameSnake` 等变量；目标路径不能包含 `.git`、`node_modules` 等目录，也不能是 `.env` 之类的敏感文件名。
- 终端链接：`pattern` 是有长度上限的正则，会做回溯安全检查；`url` 目标只允许 http/https，`{1}` 等引用捕获组；`file` 目标只在本地终端生效，只能打开已保存的本地项目中的文件。
- 引导：本模板的步骤都是纯文本（`text`）；步骤也可以用 `walkthroughs/` 下的 Markdown 或图片。带 `command` 的步骤只能由进程插件提供，见 `contributions-process-showcase` 模板。
- 终端配色：文件放在 `terminal-schemes/`、`themes/` 或 `assets/` 下（`.json`，≤ 64 KiB），内容就是完整条目；`id` 必须是 `<插件 ID>.<名称>`。必须提供前景、背景、光标、选区背景和 16 个 ANSI 颜色，只接受 `#rrggbb`（选区背景可用 `#rrggbbaa`）。对比度下限：前景 4.5、光标 3.0、选区文字 3.0、12 个彩色 ANSI 颜色 2.0、深色方案的 `brightBlack` 1.5，不满足时 `mincode plugin verify` 会报告具体颜色和比值。
- HTTP 代码生成器：模板是 `codegen/`、`templates/` 或 `assets/` 下的 `.tmpl`（≤ 32 KiB），只能使用契约中列出的变量（`method`、`url`、`urlBase`、`body` 等）、列表段（`query`、`headers`、`formFields`、`variables`）、条件段（`hasQuery`、`hasBody` 等）和过滤器；`escape` 是裸变量的默认转义，例如 `shell` 输出单引号字符串、`json` 输出带双引号的 JSON 字符串（也是合法的 Python 字符串）。独占一行的段标签和注释不会留下空行。`Authorization`、`Cookie` 等敏感请求头和敏感参数在渲染前已被替换为占位符，插件拿不到真实请求数据。
- 图标主题：`id` 必须以 `<插件 ID>.` 开头，`file` 必填，映射的键不带前导点、不区分大小写。图标只能是 `.svg` 或 `.png`（≤ 32 KiB），放在 `fileicons/`、`icons/` 或 `assets/` 下；SVG 必须带 `viewBox`，只用 `path`、`rect`、`circle` 等白名单元素，不能有 `style`、`script`、`text`、外部链接或事件属性，不合规会直接被拒绝。

### 自定义编辑器（customEditors）

`customEditors` 需要一个带视图（`views`）的**进程插件**，因此不在本声明式模板中演示。要为某种文件提供自定义编辑器，请从 `tools/plugin-templates/visual-process-vue-go/` 开始，在清单中声明：

```json
"customEditors": [
  {
    "id": "mcdemo",
    "viewId": "main",
    "title": "MinCode Demo Viewer",
    "filenamePatterns": ["*.mcdemo"],
    "priority": "option",
    "access": "read"
  }
]
```

插件 UI 在 `onReady` 之后调用 `transport.document.info()`；返回非 `null` 时，用 `transport.document.readText()` / `readAll({ maxBytes })` 读取绑定的文件，并监听 `onDocumentChanged` 重新加载。只读查看器使用 `access: "read"`，无需额外能力；只有插件本身就是该二进制格式的自然查看器时才使用 `priority: "default"`。官方示例见 `official-plugins/jfr-viewer`、`official-plugins/pprof-viewer`。

### 终端配置（terminalProfiles）

`terminalProfiles` 仅限**进程插件**（清单 API v2），且 `capabilities` 中必须声明 `shell`；声明式插件不能带任何能力，因此不在本模板中演示。要在终端的“+”菜单和命令面板中提供启动配置（例如 REPL 或插件自带的 TUI 工具），请从进程插件模板开始，在清单中声明：

```json
"capabilities": ["shell"],
"contributes": {
  "terminalProfiles": [
    { "id": "node-repl", "title": "Node REPL", "titleLocalized": { "zh": "Node 交互环境" },
      "command": "node", "args": ["--experimental-repl-await"],
      "env": { "FORCE_COLOR": "1" }, "cwd": "${workspaceFolder}", "platforms": ["darwin", "linux"] },
    { "id": "tool", "title": "Acme TUI", "command": "${pluginRoot}/bin/acme-tui", "args": ["--project", "${workspaceFolder}"] }
  ]
}
```

条目只能内联书写。`command` 可以是 `${pluginRoot}/相对路径`、裸程序名或绝对路径；参数按数组直接执行，不经过 shell；只支持 `${workspaceFolder}`、`${userHome}`、`${pluginRoot}` 三个变量；`PATH`、`LD_*`、`NODE_OPTIONS` 等环境变量被禁止。用户第一次启动某个配置时，MinCode 会展示完整命令行并要求确认（任何审批模式下都需要），命令或程序文件变化后需重新确认；AI 工具不能启动插件终端配置。完整规则见插件开发指南 §3.5“终端配置”。

## English

This is a **declarative** (`runtime.type: "declarative"`) MinCode plugin template. It shows how to extend the editor and AI with JSON and Markdown files only:

| Point | Files | Effect |
| --- | --- | --- |
| `languages` | `languages/mcdemo.monarch.json`, `languages/mcdemo.language-configuration.json` | Registers the `mcdemo` language for a made-up `.mcdemo` format: Monarch highlighting, `#` line comments, bracket matching, auto-closing, and indentation rules |
| `snippets` | `snippets/mcdemo.json` | Adds `task`, `when`, and `set` snippets for `mcdemo` |
| `aiPrompts` (`kind: "prompt"`) | inline `template` in `plugin.json` | Explains the selected code using the `{{selection}}`, `{{language}}`, and `{{file}}` placeholders |
| `aiPrompts` (`kind: "skill"`) | `skills/mcdemo-style.md` | A `.mcdemo` style guide that AI sessions can load |
| `localizations` | `l10n/messages.ja.json` | A demo Japanese (`ja`) UI language pack. It translates a few host messages in the sidebar and command palette; everything else falls back to the Simplified Chinese or English base the user picks |
| `fileIcons` | inline theme in `plugin.json` + `fileicons/*.svg` | The `contributions-showcase.demo` file icon theme: default file, folder (collapsed/expanded), and `.mcdemo` icons, with a darker `.mcdemo` variant for light themes |
| `jsonValidation` | `schemas/mcdemo-config.schema.json` | Completion, hovers, and diagnostics from a JSON Schema when `mcdemo.config.json` is open in the editor |
| `commandSnippets` | `commands/mcdemo.json` | The “MinCode Demo” terminal command library: a one-line command with a `dir` variable and a multi-line command. Snippets are inserted at the prompt and never run automatically |
| `httpCollections` | `http/mcdemo-api.json` | An HTTP request collection template using `{{baseUrl}}` and `{{token}}` with a Local environment. The user imports a copy or opens drafts; nothing is sent automatically |
| `fileTemplates` | `templates/**/*.tmpl` | A New File template `{{mincode.name}}.mcdemo` and a New Project template with a README, `src/main.mcdemo`, and `mcdemo.config.json` |
| `terminalLinks` | inline in `plugin.json` | `MCDEMO-123` in terminal output links to `https://example.com/issues/123`; in local terminals `path.mcdemo:12` opens that file (inside a saved Local Project) at that line |
| `terminalColorSchemes` | `terminal-schemes/mcdemo-dark.json`, `terminal-schemes/mcdemo-light.json` | Two terminal color schemes, “MinCode Demo Dark/Light”, applied only after the user picks one in the Plugin schemes group of Settings → Terminal → Color scheme |
| `httpCodeGenerators` | `assets/codegen/httpie.tmpl`, `assets/codegen/python-requests.tmpl` | HTTPie (`escape: shell`) and Python requests (`escape: json`) generators in the HTTP workspace's Generate code dialog, rendered locally by the host |
| `walkthroughs` | inline in `plugin.json` | The featured “Get started with MinCode Demo” walkthrough with four text-only steps |

Declarative plugins have no `entry`, `capabilities`, `commands`, `views`, or `actions`. They never start a local process, are always global, and do not count against the plan's plugin quota. Nothing needs to be built: the directory itself is installable.

### Layout

```text
contributions-showcase/
├── plugin.json                                  # manifest (API v2, declarative)
├── languages/
│   ├── mcdemo.monarch.json                      # Monarch grammar (needs a tokenizer; strict JSON)
│   └── mcdemo.language-configuration.json       # language configuration (allowlisted keys only)
├── snippets/
│   └── mcdemo.json                              # VS Code-compatible snippet format
├── skills/
│   └── mcdemo-style.md                          # AI skill (Markdown, optional front matter)
├── l10n/
│   └── messages.ja.json                         # language pack: flat {"host message key": "text"}
├── fileicons/
│   ├── file.svg, folder.svg, folder-open.svg    # default file and folder icons
│   └── mcdemo.svg, mcdemo-light.svg             # .mcdemo icons (dark/light)
├── schemas/
│   └── mcdemo-config.schema.json                # JSON Schema (strict JSON, only same-document # $refs)
├── commands/
│   └── mcdemo.json                              # terminal command snippet library
├── http/
│   └── mcdemo-api.json                          # mincode.http-collection v1 collection
├── templates/
│   ├── file.mcdemo.tmpl                         # New File template
│   └── project/…                                # New Project template (README, src/main.mcdemo, mcdemo.config.json)
├── terminal-schemes/
│   └── mcdemo-dark.json, mcdemo-light.json      # terminal color schemes (each file is one complete entry)
├── assets/codegen/
│   └── httpie.tmpl, python-requests.tmpl        # HTTP code generator templates (logic-less Mustache subset)
├── mcdemo.config.json                           # sample configuration to try JSON validation
└── example.mcdemo                               # sample file to try after installing
```

### Quick start

1. Copy this directory outside the MinCode repository and rename it. In `plugin.json`, set a unique lower-case `id`, plus `name`, `version`, `author`, `category`, and optional `tags`.
2. Replace the `mcdemo` language ID, the `.mcdemo` extension, and the files with your own format. The language ID must not clash with a language MinCode already registers (for example `json`, `sql`, or `typescript`).
3. Verify:

   ```bash
   mincode plugin verify ./contributions-showcase
   ```

4. In **Plugin Management**, enter the directory's absolute path and choose **Install**. Review the read-only preflight, then confirm. Open `example.mcdemo` to see highlighting and type `task` to trigger a snippet. Both `aiPrompts` entries appear in the AI assistant composer and in the plugin AI prompts section of Settings.
5. The language pack and the icon theme never apply by themselves:
   - In **Settings > General > Language**, choose “日本語” and a fallback language to switch the sidebar and other translated copy to Japanese.
   - In **Settings > General > File icon theme**, choose “MinCode Demo Icons” to use this theme in the project file tree and document tabs.
6. The other points:
   - open `mcdemo.config.json` to see schema completion and validation;
   - find “MinCode Demo” among the terminal command snippets;
   - import the “MinCode Demo API” collection in the HTTP workspace;
   - pick the “MinCode Demo” category in New File or New Project;
   - print `MCDEMO-42` or `example.mcdemo:3` in a terminal to try the links;
   - pick “MinCode Demo Dark” or “MinCode Demo Light” in Settings → Terminal → Color scheme;
   - choose HTTPie or “Python (requests)” in the HTTP workspace's Generate code dialog;
   - open the “Get started with MinCode Demo” walkthrough from the dashboard's Get started section.

### Authoring rules

- File references must point into the directories the point allows:
  - language files: `languages/`, `syntaxes/`, or `assets/`;
  - snippets: `snippets/` or `assets/`;
  - prompts and skills: `prompts/`, `skills/`, or `assets/`.

  Paths must be relative. Traversal and symlink escapes are rejected.
- Regexes in the Monarch grammar and the language configuration are checked for catastrophic backtracking. Keep them simple and avoid nested quantifiers.
- An `aiPrompts` `id` must match `^[a-z0-9][a-z0-9-]{0,47}$`, and `kind: "skill"` requires a `description`. `{{selection}}` is truncated to the host limit and always treated as untrusted content.
- Use `titleLocalized` / `descriptionLocalized` for localized copy.
- Language packs:
  - `locale` cannot be a built-in `zh` or `en` tag or variant such as `zh-CN` or `en-US`.
  - Files live in `l10n/`, `locales/`, `i18n/`, or `assets/` and must be strict JSON.
  - Keys follow the host catalogue in `vue-app/src/i18n/locales/en.ts`, and `{name}` placeholders must match the source exactly.
  - Protected security, approval, permission, and confirmation copy (such as `common.*`) is ignored even if present.
  - The optional `pluginTitles` file translates only **other plugins'** command and view titles. Use `titleLocalized` for your own titles, which is why this template does not use it.
- JSON validation:
  - `fileMatch` entries are relative globs ending in `.json` or `.jsonc`, with at least 3 literal characters in the file name before the extension (`*.json` and similar are refused).
  - Schemas live under `schemas/` or `assets/`. `$ref` must be a same-document reference starting with `#`; MinCode never fetches remote schemas.
- Command snippets: every `{{variable}}` must be declared in `variables` (at most 8), and `quote: "posix"` shell-quotes the user's value. Non-identifier text such as `{{.Names}}` stays literal. Commands are inserted, never run, and multi-line commands need the paste confirmation.
- HTTP collections have no auth fields. Sensitive headers such as `Authorization` or `Cookie`, and variables whose names contain sensitive words, must be empty or a single `{{variable}}`; values that look like real credentials are rejected.
- File templates:
  - Sources are `.tmpl` files under `templates/` or `assets/`.
  - Only `{{mincode.name}}`, `{{mincode.fileName}}`, `{{mincode.projectName}}`, `{{mincode.date}}`, `{{mincode.year}}`, and the `nameCamel`, `namePascal`, `nameKebab`, and `nameSnake` variants are expanded.
  - Target paths cannot contain directories such as `.git` or `node_modules`, or sensitive file names such as `.env`.
- Terminal links: `pattern` is a length-limited regex checked for backtracking safety. `url` targets allow only http/https, with `{1}` and so on referencing capture groups. `file` targets work only in local terminals and open files only inside saved Local Projects.
- Walkthroughs: this template's steps are plain `text`; steps may also use Markdown or images under `walkthroughs/`. Steps with a `command` are available only to process plugins; see the `contributions-process-showcase` template.
- Terminal color schemes:
  - files live in `terminal-schemes/`, `themes/`, or `assets/` (`.json`, at most 64 KiB), and each file is one complete entry whose `id` is `<plugin id>.<name>`;
  - foreground, background, cursor, selection background, and all 16 ANSI colors are required, as `#rrggbb` (the selection background may use `#rrggbbaa`);
  - contrast floors: foreground 4.5, cursor 3.0, selection text 3.0, the 12 chromatic ANSI colors 2.0, and `brightBlack` 1.5 in dark schemes; `mincode plugin verify` reports the failing color and ratio.
- HTTP code generators:
  - templates are `.tmpl` files in `codegen/`, `templates/`, or `assets/` (at most 32 KiB) and may use only the contract's variables (`method`, `url`, `urlBase`, `body`, …), list sections (`query`, `headers`, `formFields`, `variables`), flag sections (`hasQuery`, `hasBody`, …), and filters;
  - `escape` is the default for bare variables: `shell` emits a single-quoted string and `json` a double-quoted JSON string, which is also a valid Python string literal;
  - section tags and comments on a line of their own leave no blank line;
  - sensitive headers such as `Authorization` and `Cookie`, and sensitive parameters, are replaced with placeholders before rendering; the plugin never sees request data.
- Icon themes:
  - The `id` must start with `<plugin id>.` and `file` is required. Mapping keys have no leading dot and are case-insensitive.
  - Icons are `.svg` or `.png` (≤ 32 KiB) under `fileicons/`, `icons/`, or `assets/`.
  - An SVG needs a `viewBox` and may use only allowlisted elements such as `path`, `rect`, and `circle`. `style`, `script`, `text`, external links, and event attributes are not allowed. A non-compliant SVG is rejected, not cleaned.

### Custom editors (customEditors)

This declarative template does not demonstrate `customEditors`, because that point requires a **process plugin** with `views`. To provide a custom editor for a file type, start from `tools/plugin-templates/visual-process-vue-go/` and declare:

```json
"customEditors": [
  {
    "id": "mcdemo",
    "viewId": "main",
    "title": "MinCode Demo Viewer",
    "filenamePatterns": ["*.mcdemo"],
    "priority": "option",
    "access": "read"
  }
]
```

After `onReady`, the plugin UI calls `transport.document.info()`. When that returns a non-`null` value:

- read the bound file with `transport.document.readText()` or `readAll({ maxBytes })`;
- reload it from `onDocumentChanged`.

A read-only viewer uses `access: "read"` and needs no extra capability. Use `priority: "default"` only when the plugin is the natural viewer for that binary format. See `official-plugins/jfr-viewer` and `official-plugins/pprof-viewer` for official examples.

### Terminal profiles (terminalProfiles)

This declarative template does not demonstrate `terminalProfiles`. That point is limited to **process plugins** (manifest API v2) that declare the `shell` capability, and declarative plugins cannot declare capabilities. To add launch profiles to the terminal "+" menu and the command palette (for example a REPL or a TUI tool shipped with the plugin), start from a process plugin template and declare:

```json
"capabilities": ["shell"],
"contributes": {
  "terminalProfiles": [
    { "id": "node-repl", "title": "Node REPL", "titleLocalized": { "zh": "Node 交互环境" },
      "command": "node", "args": ["--experimental-repl-await"],
      "env": { "FORCE_COLOR": "1" }, "cwd": "${workspaceFolder}", "platforms": ["darwin", "linux"] },
    { "id": "tool", "title": "Acme TUI", "command": "${pluginRoot}/bin/acme-tui", "args": ["--project", "${workspaceFolder}"] }
  ]
}
```

- Entries must be inline.
- `command` is `${pluginRoot}/<relative path>`, a bare program name, or an absolute path. Arguments run as an array without a shell.
- Only `${workspaceFolder}`, `${userHome}`, and `${pluginRoot}` are expanded. Variables such as `PATH`, `LD_*`, and `NODE_OPTIONS` are forbidden in `env`.
- The first launch of a profile shows the full command line and requires confirmation in every approval mode. A changed command or program file requires confirmation again. AI tools cannot launch plugin terminal profiles.

See "Terminal profiles" in §3.5 of the plugin development guide for the full rules.
