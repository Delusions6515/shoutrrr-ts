import { readdir, readFile } from "node:fs/promises";

const directory = "test/compatibility/fixtures/generic";
const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
if (files.length === 0) throw new Error("No Generic compatibility fixtures found");
for (const file of files) {
  const fixture = JSON.parse(await readFile(`${directory}/${file}`, "utf8"));
  for (const key of ["source", "case", "url", "message", "request"]) {
    if (!(key in fixture)) throw new Error(`${file} is missing ${key}`);
  }
  if (!fixture.source.includes("containrrr/shoutrrr ccf8139 pkg/services/generic/")) {
    throw new Error(`${file} must identify the pinned Go Generic source`);
  }
  for (const key of ["method", "url", "headers", "body"]) {
    if (!(key in fixture.request)) throw new Error(`${file} request is missing ${key}`);
  }
}
console.log(`Compatibility fixture metadata verified for ${files.length} Generic cases.`);
