import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createSender, send } from "../../src/index.ts";

interface Case {
  url: string; message: string; responseStatus?: number;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
  goObserved: { outcome: string };
}

it("replays Go Teams legacy, scoped and custom webhook requests", async () => {
  const directory = "test/compatibility/fixtures/teams";
  const cases = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(`${directory}/${name}`, "utf8")) as Case));
  const previous = globalThis.fetch;
  let active: Case;
  const captured: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init });
    return new Response("synthetic response", { status: active.responseStatus ?? 200 });
  }) as typeof fetch;
  try {
    for (const fixture of cases) {
      active = fixture;
      if (fixture.goObserved.outcome === "success") {
        await expect(send(fixture.url, fixture.message)).resolves.toBeUndefined();
      } else {
        await expect(send(fixture.url, fixture.message)).rejects.toThrow("notification delivery failed");
      }
    }
  } finally { globalThis.fetch = previous; }
  expect(captured).toHaveLength(cases.length);
  for (const [index, fixture] of cases.entries()) {
    const actual = captured[index];
    expect(actual?.url).toBe(fixture.request.url);
    expect(actual?.init?.method).toBe("POST");
    expect(new Headers(actual?.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(actual?.init?.body))).toEqual(fixture.request.body);
  }
});

it("rejects invalid webhook parts and normalizes public failures", async () => {
  const previous = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => { count++; throw new Error("synthetic-private-host"); }) as typeof fetch;
  try {
    await expect(send("teams://invalid@invalid/invalid/invalid", "hello"))
      .rejects.toThrow("notification delivery failed");
    expect(count).toBe(0);
    const fixture = JSON.parse(await readFile("test/compatibility/fixtures/teams/basic.json", "utf8")) as Case;
    await expect(send(fixture.url, fixture.message)).rejects.toThrow("notification delivery failed");
    expect(count).toBe(1);
  } finally { globalThis.fetch = previous; }
});

it("persists valid title overrides and ignores bad send params like Go", async () => {
  const fixture = JSON.parse(await readFile("test/compatibility/fixtures/teams/basic.json", "utf8")) as Case;
  const previous = globalThis.fetch;
  const titles: string[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    titles.push((JSON.parse(String(init?.body)) as { title?: string }).title ?? "");
    return new Response("ok");
  }) as typeof fetch;
  try {
    const sender = createSender(fixture.url);
    expect(await sender.send("one", { title: "Release" })).toEqual([]);
    expect(await sender.send("two", { unknown: "invalid" })).toEqual([]);
  } finally { globalThis.fetch = previous; }
  expect(titles).toEqual(["Release", "Release"]);
});
