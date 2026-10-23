import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import process from "node:process";

const root = new URL("../dist-plugin/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
const source = JSON.parse(await readFile(new URL("../plugin.template.json", import.meta.url), "utf8"));
const categories = new Set(["database", "spreadsheet", "web", "api", "network", "development", "productivity", "other"]);
if (!categories.has(manifest.category)) throw new Error("category is required and must be a known category");
for (const key of ["category", "tags", "homepage"]) {
  if (JSON.stringify(manifest[key]) !== JSON.stringify(source[key])) {
    throw new Error(`build must preserve source catalog metadata: ${key}`);
  }
}
if (manifest.tags !== undefined && (!Array.isArray(manifest.tags) || manifest.tags.length > 8 ||
  manifest.tags.some((tag) => typeof tag !== "string" || [...tag.trim()].length > 24))) {
  throw new Error("tags must contain at most 8 strings, each at most 24 Unicode code points after trimming");
}
if (manifest.homepage !== undefined) {
  if (typeof manifest.homepage !== "string") throw new Error("homepage must be a string");
  const homepage = manifest.homepage.trim();
  if (homepage) {
    const address = new URL(homepage);
    // URL.username drops empty userinfo; inspect the authority as well.
    const authority = /^https?:\/\/([^/?#]*)/i.exec(homepage)?.[1];
    if (!authority || authority.includes("@") || !["http:", "https:"].includes(address.protocol) || !address.hostname) {
      throw new Error("homepage must be an absolute HTTP/HTTPS URL without userinfo");
    }
  }
}
if (manifest.runtime?.type !== "process") throw new Error("runtime.type must be process");
if (manifest.contributes?.views?.[0]?.entry !== "ui/index.html") throw new Error("view entry is invalid");
await access(new URL("ui/index.html", root), constants.R_OK);
await access(new URL(manifest.runtime.entry, root), constants.R_OK);

let files = 0;
let bytes = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) await walk(url);
    else {
      files += 1;
      bytes += (await stat(url)).size;
    }
  }
}
await walk(root);
if (files > 2_000) throw new Error(`dist-plugin has ${files} files; limit is 2000`);
if (bytes > 64 * 1024 * 1024) throw new Error(`dist-plugin has ${bytes} bytes; limit is 64 MiB`);
if (!manifest.platforms?.includes("windows")) {
  await access(new URL(manifest.runtime.entry, root), constants.X_OK);
}
for (const forbidden of ["node_modules", "package.json", "go.mod", "go.sum", "src", "backend"]) {
  try {
    await access(new URL(forbidden, root));
    throw new Error(`dist-plugin must not contain source/dependency path: ${forbidden}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("dist-plugin must not contain")) throw error;
  }
}
console.log(`Verified dist-plugin: ${files} files, ${bytes} bytes`);
