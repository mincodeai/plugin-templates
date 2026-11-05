// The backend requires the published github.com/mincodeai/plugin-sdk-go module.
// A freshly created project has no backend/go.sum yet, so the first build runs
// `go mod tidy` once (this needs network access to the Go module proxy; set
// GOPROXY, e.g. https://goproxy.cn, if the default proxy is unreachable). Commit
// the resulting go.sum. Nothing runs inside a Go workspace (GOWORK) or while
// go.mod still replaces the SDK with a local directory.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backend = fileURLToPath(new URL("../backend/", import.meta.url));

export function ensureGoSum() {
  if (existsSync(new URL("../backend/go.sum", import.meta.url))) return false;
  const gowork = execFileSync("go", ["env", "GOWORK"], { cwd: backend, encoding: "utf8" }).trim();
  if (gowork !== "" && gowork !== "off") return false;
  const goMod = readFileSync(new URL("../backend/go.mod", import.meta.url), "utf8");
  if (/^\s*replace\s+github\.com\/mincodeai\/plugin-sdk-go\b/m.test(goMod)) return false;
  console.log("backend/go.sum is missing: running go mod tidy (downloads github.com/mincodeai/plugin-sdk-go)");
  execFileSync("go", ["mod", "tidy"], { cwd: backend, stdio: "inherit" });
  return true;
}

// Real paths: macOS temporary directories are reached through the /var -> /private/var symlink.
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) ensureGoSum();
