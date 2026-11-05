# MinCode plugin templates

MinCode 插件的起步模板与示例工程。/ Starter templates and example projects for MinCode plugins.

## 起步模板 / Starters

可以用 `mincode plugin create <目录> --id <插件ID> --template <模板>` 直接生成，也可以复制目录后自行修改。
Create a project with `mincode plugin create <dir> --id <plugin-id> --template <template>`, or copy a directory.

| 模板 / Template | 说明 | Description |
| --- | --- | --- |
| [`visual-process-vue-go`](visual-process-vue-go/) | Vue 3 + Go 可视化插件（`mincode plugin create` 默认模板） | Vue 3 + Go visual plugin (default `mincode plugin create` template) |
| [`visual-process-ts-go`](visual-process-ts-go/) | TypeScript + Go 可视化插件，不使用 Vue 时选它 | TypeScript + Go visual plugin for projects without Vue |
| [`local-process-node`](local-process-node/) | Node.js 本地进程插件（无界面的命令 / 数据处理） | Node.js local process plugin (commands and data processing, no UI) |
| [`local-process-rust`](local-process-rust/) | Rust 本地进程插件，不依赖 SDK | Rust local process plugin without an SDK |

## 示例工程 / Showcases

| 示例 / Example | 说明 | Description |
| --- | --- | --- |
| [`contributions-showcase`](contributions-showcase/) | 声明式贡献点示例：键位、片段、主题、文件图标等 | Declarative contribution points: keymaps, snippets, themes, file icons, ... |
| [`contributions-process-showcase`](contributions-process-showcase/) | 需要插件进程的贡献点示例 | Contribution points backed by a plugin process |
| [`host-api-showcase`](host-api-showcase/) | 逐项调用宿主接口的实测插件 | Exercises the host APIs one by one |

## 文档 / Documentation

- 插件开发指南 / Plugin development guide: https://www.mincodeai.cn/llms/plugin-development.md
- 本地进程插件模板说明 / Local process templates: https://www.mincodeai.cn/llms/local-plugin-template.md
- 给 AI 助手的文档索引 / Docs for AI assistants: https://www.mincodeai.cn/llms.txt

模板依赖已发布的 `github.com/mincodeai/plugin-sdk-go` 与 `@mincodeai/plugin-ui`（Node 模板为 `@mincodeai/plugin-sdk`），版本与 MinCode 同步，首次安装依赖与构建需要联网。模板由 MinCode 主仓库生成，请勿直接在本仓库修改。
The templates depend on the published `github.com/mincodeai/plugin-sdk-go` and `@mincodeai/plugin-ui` (`@mincodeai/plugin-sdk` for the Node template), versioned with MinCode; the first dependency install and build need network access. This repository is generated from the MinCode repository; please do not edit it directly.

## License

Apache License 2.0, see [LICENSE](LICENSE).
