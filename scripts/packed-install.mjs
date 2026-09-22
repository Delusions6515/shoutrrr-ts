import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const work = await mkdtemp(join(tmpdir(), "shoutrrr-ts-pack-"));
const packDir = join(work, "pack");

try {
  await execFileAsync("pnpm", ["pack", "--pack-destination", packDir], { cwd: root });
  const archive = join(packDir, (await readdir(packDir)).find((entry) => entry.endsWith(".tgz")) ?? "");
  if (!archive.endsWith(".tgz")) throw new Error("pnpm pack did not produce a tarball");

  const { stdout } = await execFileAsync("tar", ["-tzf", archive]);
  const entries = stdout.trim().split("\n").filter(Boolean);
  const forbidden = entries.filter((entry) => /(?:^|\/)(?:AGENTS\.md|docs\/plans|packages\/|src\/|test\/)/.test(entry));
  if (forbidden.length) throw new Error(`tarball includes non-public paths: ${forbidden.join(", ")}`);
  for (const required of ["package/LICENSE", "package/README.md", "package/COMPATIBILITY.md", "package/THIRD_PARTY_NOTICES.md", "package/LICENSES/woodpecker-MIT.txt", "package/dist/index.js", "package/dist/index.d.ts"]) {
    if (!entries.includes(required)) throw new Error(`tarball is missing ${required}`);
  }

  const consumer = join(work, "consumer");
  await writeFile(join(work, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await writeFile(join(work, "pnpm-workspace.yaml"), "packages:\n  - consumer\n");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({
    private: true,
    type: "module",
    dependencies: { "shoutrrr-ts": `file:${archive}` },
  }));
  await execFileAsync("pnpm", ["install", "--frozen-lockfile=false", "--ignore-scripts"], { cwd: consumer });
  await execFileAsync("node", ["--input-type=module", "--eval", "import { send, createSender, sendDetailed } from 'shoutrrr-ts'; if (typeof send !== 'function' || typeof createSender !== 'function' || typeof sendDetailed !== 'function') process.exit(1);"], { cwd: consumer });
  console.log(`Packed install verified: ${basename(archive)}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
