import { rm } from "node:fs/promises";

await rm(new URL("../dist-plugin", import.meta.url), { recursive: true, force: true });
