import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("blocks a stable service when its Go observation is missing or differs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shoutrrr-evidence-"));
  try {
    await cp("test/compatibility", join(dir, "test/compatibility"), { recursive: true });
    await cp("src/register-stable-services.ts", join(dir, "src/register-stable-services.ts"));
    const script = new URL("../../scripts/verify-compatibility-fixtures.mjs", import.meta.url).pathname;
    const verify = () => spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    expect(verify().status).toBe(0);

    const path = join(dir, "test/compatibility/fixtures/generic/basic.json");
    const fixture = JSON.parse(await readFile(path, "utf8"));
    delete fixture.goObserved;
    await writeFile(path, JSON.stringify(fixture));
    expect(verify().status).not.toBe(0);

    fixture.goObserved = { ...fixture.request, outcome: "success" };
    fixture.request.method = "PUT";
    await writeFile(path, JSON.stringify(fixture));
    expect(verify().status).not.toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
