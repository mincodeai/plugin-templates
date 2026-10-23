import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";
import test from "node:test";

async function buildBackend() {
  const directory = await mkdtemp(join(tmpdir(), "mincode-vue-go-plugin-"));
  const binary = join(directory, process.platform === "win32" ? "plugin.exe" : "plugin");
  const result = spawnSync("go", ["build", "-trimpath", "-o", binary, "."], {
    cwd: new URL("../backend/", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  if (process.platform !== "win32") await chmod(binary, 0o755);
  return { binary, directory };
}

function call(lines, processHandle, method, params) {
  const id = String(call.sequence++);
  processHandle.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 5_000);
    function consume(line) {
      const response = JSON.parse(line);
      if (response.id !== id) return;
      clearTimeout(timer);
      lines.off("line", consume);
      if (response.error) reject(new Error(response.error.message));
      else resolve(response.result);
    }
    lines.on("line", consume);
  });
}
call.sequence = 1;

test("built Go process implements the MinCode lifecycle and invoke protocol", async t => {
  const { binary, directory } = await buildBackend();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill());
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

  assert.deepEqual(await call(lines, child, "plugin.initialize", {
    runtimeProtocolVersion: 1,
    manifestApiVersion: 2,
  }), { runtimeProtocolVersion: 1 });
  assert.deepEqual(await call(lines, child, "plugin.ping", {}), { runtimeProtocolVersion: 1 });
  const greeting = await call(lines, child, "plugin.invoke", {
    action: "greeting.create",
    payload: JSON.stringify({ name: "MinCode" }),
  });
  assert.equal(greeting.message, "你好，MinCode！");
  assert.equal(greeting.runtime, "go");
  assert.match(greeting.receivedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(await call(lines, child, "plugin.shutdown", {}), {});
  await once(child, "exit");
  assert.equal(child.exitCode, 0);
});

test("manifest template remains valid JSON", async () => {
  const manifest = JSON.parse(await readFile(new URL("../plugin.template.json", import.meta.url), "utf8"));
  assert.equal(manifest.apiVersion, 2);
  assert.equal(manifest.runtime.type, "process");
  assert.equal(manifest.contributes.views[0].entry, "ui/index.html");
});
