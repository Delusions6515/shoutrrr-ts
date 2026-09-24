import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createSender, send } from "../../src/index.ts";

type Request = { method: string; url: string; headers: Record<string, string>; body: unknown };
type Case = { url: string; message: string; responseStatus?: number; transportFailure?: boolean; captureAll?: boolean;
  request: Request; requests?: Request[]; goObserved: { outcome: string } };

it("matches Go Discord embeds, raw payload, status rules, and multi-batch order", async () => {
  const directory = "test/compatibility/fixtures/discord";
  const cases = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(`${directory}/${name}`, "utf8")) as Case));
  const previous = globalThis.fetch;
  const captured: Request[] = [];
  let active: Case;
  globalThis.fetch = (async (url: string | URL | globalThis.Request, init?: RequestInit) => {
    captured.push({ method: init?.method ?? "", url: String(url),
      headers: { "accept": "", "content-type": new Headers(init?.headers).get("content-type") ?? "" },
      body: JSON.parse(String(init?.body)) });
    if (active.transportFailure) throw new Error("synthetic-private-token");
    return new Response(null, { status: active.responseStatus ?? 204 });
  }) as typeof fetch;
  try {
    for (const fixture of cases) {
      active = fixture;
      const from = captured.length;
      if (fixture.goObserved.outcome === "success") {
        await expect(send(fixture.url, fixture.message)).resolves.toBeUndefined();
      } else {
        await expect(send(fixture.url, fixture.message)).rejects.toThrow("notification delivery failed");
      }
      const expected = fixture.captureAll ? fixture.requests : [fixture.request];
      expect(captured.slice(from)).toEqual(expected);
    }
  } finally { globalThis.fetch = previous; }
});

it("validates webhook IDs and isolates valid sender overrides", async () => {
  const fixture = JSON.parse(await readFile("test/compatibility/fixtures/discord/basic.json", "utf8")) as Case;
  const previous = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: string | URL | globalThis.Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    await expect(send("discord://@hook.example.test", "hello"))
      .rejects.toThrow("notification delivery failed");
    const sender = createSender(fixture.url);
    expect(await sender.send("hello", { title: "Temporary", color: "0x112233" })).toEqual([]);
    expect(await sender.send("hello")).toEqual([]);
    expect(await sender.send("hello", { splitLines: "not-a-bool" })).toHaveLength(1);
  } finally { globalThis.fetch = previous; }
  expect(bodies).toEqual([
    { embeds: [{ title: "Temporary", description: "hello", color: 1122867 }] },
    fixture.request.body,
  ]);
});
