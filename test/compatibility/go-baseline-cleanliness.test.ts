import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("refuses a pinned Go revision with tracked checkout changes before reading its modules", async () => {
  const root = await mkdtemp(join(tmpdir(), "shoutrrr-baseline-clean-"));
  const upstream = join(root, "upstream");
  const bin = join(root, "bin");
  try {
    await mkdir(upstream);
    await mkdir(bin);
    const git = join(bin, "git");
    await writeFile(git, `#!/bin/sh
if [ "$1" = "rev-parse" ]; then
  printf '%s\\n' 'ccf81390b700948f85ce1c79f6de9ee75c68d9e5'
elif [ "$1" = "status" ]; then
  printf '%s\\n' ' M pkg/services/generic/generic.go'
else
  exit 2
fi
`);
    await chmod(git, 0o755);
    const script = new URL("../../scripts/verify-go-baseline.mjs", import.meta.url).pathname;
    const result = spawnSync(process.execPath, [script], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, SHOUTRRR_GO_ROOT: upstream },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tracked changes");
    expect(result.stderr).not.toContain("pkg/services/generic/generic.go");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
