# Rust process plugin starter

A self-contained, build-first command plugin for MinCode. It speaks the same
JSONL protocol v1 as any other language; no Go or Node SDK is required. Rust
is a development dependency only: users install the compiled executable.

## Build and install

Requires Rust/Cargo >= 1.85. The repository tests with Rust 1.90.0.

```sh
cargo test --workspace --locked
cargo xtask build
mincode plugin verify dist-plugin
mincode plugin pack dist-plugin
```

Or use `mincode plugin test .` and `mincode plugin build .`; the native CLI
reads these commands from `mincode.config.json` and needs no Node installation.
Create the project with `mincode plugin create ./my-rust --template local-process-rust --id example.rust`
(the `mincode` CLI that ships with the MinCode desktop app embeds this template).

Edit `plugin.template.json` (ID, name, version, command IDs), not the generated
`dist-plugin/plugin.json`. The executable embeds its own manifest identity at
compile time and never copies the identity sent by the host. Source code and
`target/` are not part of the installable package. Building is explicit and
happens on the developer's computer, never during plugin installation.

`cargo xtask build` packages the current OS/CPU by default. Windows gets
`.exe`; macOS and Linux get the native executable.

## Release for the plugin market

```sh
mincode plugin release                                # all four market platforms
mincode plugin release --targets darwin/arm64         # only this platform
```

`release` runs `cargo xtask build` once per platform (darwin/arm64,
darwin/amd64, windows/amd64, linux/amd64) with `MINCODE_TARGET_OS` and
`MINCODE_TARGET_ARCH` set, packs each `dist-plugin/` into
`dist-release/<id>-<version>/<id>-<version>-<os>-<arch>.min` and writes
`SHA256SUMS` and `release.json`. For a platform other than the host, xtask runs
`cargo build --target <triple>` (`aarch64-apple-darwin`, `x86_64-apple-darwin`,
`x86_64-pc-windows-gnu`, `x86_64-unknown-linux-gnu`) and takes the executable
from `target/<triple>/release/`. Cross builds need a rustup-managed
toolchain: install each missing target with `rustup target add <triple>`;
cross-linking also needs a linker for that target
(for example MinGW-w64 for Windows, configured in `.cargo/config.toml`). If a
target is missing, `release` stops before building and names the command; use
`--targets` with your own platform to package just that one. Do not set
`CARGO_BUILD_TARGET` yourself: it would also cross-compile the xtask helper,
so `release` refuses to start while it is set. After a release, `dist-plugin/`
holds the last platform's build; run `mincode plugin build` again before
`dev`, `pack` or installing on this computer.
If you add signing or runtime libraries, test the complete package on each
target. Keep `Cargo.lock` committed and review crate dependencies.

## Protocol boundary

- stdin/stdout: one UTF-8 JSON-RPC 2.0 value per line (maximum 1 MiB): a message or a batch array, answered with one array (§6). Unparsable input gets `-32700`, invalid requests `-32600`; method-less messages are responses and never answered.
- stderr: logs only; stdout must never contain debug output.
- Implements initialize, ping, hello invoke, shutdown and standard errors.
- A single bounded worker runs actions while the input loop handles heartbeats;
  another action receives `-32029` busy. Keep handlers bounded, handle errors
  and add cancellation before adding long-running work.
- Invalid/malformed messages and payloads are rejected without logging payloads.
  Overlong input is drained to the next newline without unbounded allocation.
- It negotiates no optional features: no task/configuration/event/binary-channel
  support is implied. This example is not a complete Rust SDK. Add only features
  implemented and tested against the published host contract.
- Absent name defaults to MinCode; `hello` accepts only `{ "name": "..." }`.

The `commands` capability grants only MinCode's relevant host APIs. Local
processes are not an OS sandbox: enabling a plugin executes its code with the
user's OS permissions. Never publish credentials or log protocol payloads.

A visual plugin may pair this Rust backend with Vue 3 + Element Plus static
assets and the existing sandbox bridge; the UI rules do not change. This
starter intentionally has no UI and does not require npm or the main repo.
