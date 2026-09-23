import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  const manifest = JSON.parse(await readFile(join(root, "test/compatibility/services.json"), "utf8"));
  const stable = await Promise.all(Object.entries(manifest.services)
    .filter(([, value]) => value.status === "stable")
    .map(async ([name, value]) => ({
      name,
      url: JSON.parse(await readFile(join(root, `test/compatibility/fixtures/${name}/${value.fixtures[0]}.json`), "utf8")).url,
    })));
  const smoke = `
    import { send, createSender, sendDetailed } from 'shoutrrr-ts';
    if (typeof send !== 'function' || typeof createSender !== 'function' || typeof sendDetailed !== 'function') process.exit(1);
    const stable = ${JSON.stringify(stable)};
    let count = 0;
    globalThis.fetch = async () => { count++; return new Response('{"code":200,"id":1,"message":"ok"}', {status:200}); };
    for (const entry of stable) await send(entry.url, 'packed smoke');
    if (count !== stable.length) process.exit(2);
    try { await send('slack://token@example.test', 'unsupported'); process.exit(3); }
    catch (error) { if (!String(error.message).includes('not supported')) process.exit(4); }
  `;
  await execFileAsync("node", ["--input-type=module", "--eval", smoke], { cwd: consumer });
  console.log(`Packed install verified: ${basename(archive)}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
