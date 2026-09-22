import { readFile } from "node:fs/promises";

const required = [
  ["LICENSE", "GNU AFFERO GENERAL PUBLIC LICENSE"],
  ["LICENSES/woodpecker-MIT.txt", "MIT License"],
  ["LICENSES/woodpecker-MIT.txt", "Copyright (c) 2019 Containrrr"],
  ["THIRD_PARTY_NOTICES.md", "52b495422f0e7176841d4955c9c1a6fadd416a4a"],
  ["THIRD_PARTY_NOTICES.md", "ccf8139"],
];
for (const [file, text] of required) {
  const content = await readFile(file, "utf8");
  if (!content.includes(text)) throw new Error(`${file} is missing required provenance text: ${text}`);
}
console.log("Provenance and license notices verified.");
