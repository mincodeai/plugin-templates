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
The exported Node devkit also creates this project; use Cargo to build it,
then `mincode pack dist-plugin` or `npm run pack:plugin` to pack it.

Edit `plugin.template.json` (ID, name, version, command IDs), not the generated
`dist-plugin/plugin.json`. The executable embeds its own manifest identity at
compile time and never copies the identity sent by the host. Source code and
`target/` are not part of the installable package. Building is explicit and
happens on the developer's computer, never during plugin installation.

The starter packages the current OS/CPU only. Windows gets `.exe`; macOS and
Linux get the native executable. Build separately on each target OS/CPU; do not
rename a binary to claim another platform. `CARGO_BUILD_TARGET` is rejected by
this simple build helper, not a universal cross-compiler. If you later add
cross-compilation, signing or runtime libraries, test the complete target
package. Keep `Cargo.lock` committed and review crate dependencies.

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
