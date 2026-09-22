import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const directory = process.argv[2] ?? "dist";
const entries = await readdir(resolve(directory));
if (!entries.some((entry) => entry.endsWith(".js"))) throw new Error(`${directory} has no ESM output`);
if (!entries.some((entry) => entry.endsWith(".d.ts"))) throw new Error(`${directory} has no declaration output`);
console.log(`Package output verified in ${directory}.`);
