import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const supportedPlatforms = new Set(["darwin", "linux", "windows"]);
const hostPlatform = process.platform === "win32" ? "windows" : process.platform;
const targetPlatform = process.env.GOOS || hostPlatform;
const targetArchitecture = process.env.GOARCH || process.arch;
if (!supportedPlatforms.has(targetPlatform)) {
  throw new Error(`Unsupported GOOS: ${targetPlatform}`);
}

const architecture = targetArchitecture === "x64" ? "amd64" : targetArchitecture;
const binary = targetPlatform === "windows" ? "mincode-vue-go-plugin.exe" : "mincode-vue-go-plugin";
const backendRoot = new URL("../backend/", import.meta.url);
const outputDirectory = new URL("../dist-plugin/bin/", import.meta.url);
const output = new URL(`../dist-plugin/bin/${binary}`, import.meta.url);
await mkdir(outputDirectory, { recursive: true });

execFileSync("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", fileURLToPath(output), "."], {
  cwd: backendRoot,
  env: { ...process.env, GOOS: targetPlatform, GOARCH: architecture },
  stdio: "inherit",
});
if (targetPlatform !== "windows") await chmod(output, 0o755);

const manifestTemplate = await readFile(new URL("../plugin.template.json", import.meta.url), "utf8");
const manifest = manifestTemplate
  .replaceAll("__PLATFORM__", targetPlatform)
  .replaceAll("__BINARY__", binary);
JSON.parse(manifest);
await writeFile(new URL("../dist-plugin/plugin.json", import.meta.url), manifest);
await copyFile(new URL("../README.install.md", import.meta.url), new URL("../dist-plugin/README.md", import.meta.url));
console.log(`Built dist-plugin for ${targetPlatform}/${architecture}`);
