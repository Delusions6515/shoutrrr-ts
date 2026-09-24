import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = resolve(process.env.SHOUTRRR_GO_ROOT ?? join(root, "..", "shoutrrr"));
const pinned = "ccf81390b700948f85ce1c79f6de9ee75c68d9e5";
const version = "v0.0.0-20240806141605-e8a1dd7889d6";
const fixturesRoot = join(root, "test/compatibility/fixtures");
const record = process.argv[2] === "--record";
if (process.argv.length > (record ? 3 : 2)) throw new Error("Use --record or no arguments");

function run(binary, args, cwd) {
  const result = spawnSync(binary, args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${binary} baseline step failed; inspect the local Go setup without sharing its paths or URLs`);
  return result.stdout.trim();
}

if (run("git", ["rev-parse", "HEAD"], upstream) !== pinned) {
  throw new Error("Go baseline revision does not match the pinned revision");
}
const temp = await mkdtemp(join(tmpdir(), "shoutrrr-go-baseline-"));
try {
  const modfile = join(temp, "baseline.mod");
  await copyFile(join(upstream, "go.mod"), modfile);
  await copyFile(join(upstream, "go.sum"), join(temp, "baseline.sum"));
  // The pinned checkout imports this dependency but omits it from go.mod.
  // Add the fixed version only to a temporary modfile; do not modify upstream.
  run("go", ["mod", "edit", `-modfile=${modfile}`, `-require=github.com/AdaLogics/go-fuzz-headers@${version}`], upstream);
  run("go", ["mod", "download", `-modfile=${modfile}`, `github.com/AdaLogics/go-fuzz-headers@${version}`], upstream);
  let count = 0;
  for (const service of (await readdir(fixturesRoot)).sort()) {
    if (!["generic", "bark", "gotify", "rocketchat", "mattermost", "pushover", "join", "googlechat", "pushbullet", "zulip", "ntfy", "ifttt", "teams", "opsgenie", "slack", "telegram"].includes(service)) continue;
    for (const name of (await readdir(join(fixturesRoot, service))).filter((file) => file.endsWith(".json")).sort()) {
    const path = join(fixturesRoot, service, name);
    const fixture = JSON.parse(await readFile(path, "utf8"));
    const output = run("go", ["run", `-modfile=${modfile}`, join(root, "test/compatibility/go-baseline/main.go"), path], upstream);
    const observed = JSON.parse(output);
    if (record) {
      fixture.goObserved = observed;
      await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`);
    } else if (!isDeepStrictEqual(observed, fixture.goObserved)) {
      throw new Error(`Go observation differs from committed fixture ${name}`);
    }
    if (fixture.captureAll && !isDeepStrictEqual(observed.requests?.map(
      ({ method, url, headers, body }) => ({ method, url, headers, body })), fixture.requests)) {
      throw new Error(`Go request sequence differs from TypeScript expectation in ${name}`);
    }
    if (!isDeepStrictEqual(observed.method, fixture.request.method) ||
        !isDeepStrictEqual(observed.url, fixture.request.url) ||
        !isDeepStrictEqual(observed.headers, fixture.request.headers) ||
        !isDeepStrictEqual(observed.body, fixture.request.body)) {
      throw new Error(`Go request differs from TypeScript expectation in ${name}`);
    }
    count++;
    }
  }
  console.log(`Pinned Go observations verified for ${count} service fixtures.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
