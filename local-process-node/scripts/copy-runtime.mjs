// Copies the MinCode Node plugin runtime from the installed @mincodeai/plugin-sdk
// package into lib/, so the plugin directory runs on its own: MinCode installs
// the directory as is and never runs npm install. Re-run `npm run build` after
// updating @mincodeai/plugin-sdk in package.json.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runtime = fileURLToPath(import.meta.resolve("@mincodeai/plugin-sdk/runtime.mjs"));
const lib = fileURLToPath(new URL("../lib/", import.meta.url));
await mkdir(lib, { recursive: true });
for (const name of ["runtime.mjs", "runtime.d.mts"]) {
  await copyFile(join(dirname(runtime), name), join(lib, name));
}
console.log("Copied @mincodeai/plugin-sdk runtime into lib/");
