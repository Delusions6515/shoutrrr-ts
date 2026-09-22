import { copyFile, readdir } from "node:fs/promises";

const entry = (await readdir("dist")).find((file) => /^index-.+\.d\.ts$/.test(file));
if (!entry) throw new Error("tsdown did not create an entry declaration");
await copyFile(`dist/${entry}`, "dist/index.d.ts");
