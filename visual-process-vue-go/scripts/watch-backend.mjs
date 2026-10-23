import { spawn } from "node:child_process";
import { watch } from "node:fs";

let child;
let timer;
let building = false;
let queued = false;

function build() {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  child = spawn(process.execPath, [new URL("./build-backend.mjs", import.meta.url).pathname], {
    stdio: "inherit",
  });
  child.once("exit", code => {
    child = undefined;
    building = false;
    if (code !== 0) console.error(`Backend build failed with exit code ${code ?? "unknown"}`);
    if (queued) {
      queued = false;
      build();
    }
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(build, 150);
}

const watcher = watch(new URL("../backend/", import.meta.url), { recursive: true }, schedule);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearTimeout(timer);
    watcher.close();
    child?.kill(signal);
    process.exitCode = 0;
  });
}

build();
