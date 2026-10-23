# Vue + Go Plugin

This directory is a built MinCode plugin package. Select the directory itself in **Plugin Management**, review the read-only preflight (catalog metadata, capabilities, platform, and validation results), then explicitly confirm installation and enable it. Preflight does not copy, register, enable, execute, or write plugin data; installation revalidates.

Only `plugin.json` is accepted. There is no legacy filename fallback or automatic migration; invalid installed packages retain configuration/KV data and display their error without starting.

The package does not require Node.js, pnpm, Go, source files, or `node_modules` on the target machine. Keep all files together. On macOS/Linux, preserve the executable bit on `bin/mincode-vue-go-plugin`.
