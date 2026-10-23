# Host API Showcase（宿主接口实测）

人工验证通用宿主接口用的进程插件（Node，无依赖），不发布、不在 `mincode plugin templates` 中列出。
验证步骤见 插件扩展点人工验证清单 §8（MinCode 仓库 `docs/verification/contribution-points.md`）。

- 安装：插件管理 → 从目录安装，选择本目录（或打包成 ZIP 后安装）；需要本机已安装 Node。
- 使用：命令面板搜索“宿主接口实测”，每个命令调用一个宿主方法，结果以通知显示（✓ 成功 / ✗ 失败）。
- `lib/runtime.mjs` 由 `pnpm --dir vue-app build:plugin-runtime` 从 `packages/plugin-sdk/node` 同步，不要手改。
