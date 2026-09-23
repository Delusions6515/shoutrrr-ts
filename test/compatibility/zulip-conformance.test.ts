import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createSender, send } from "../../src/index.ts";

interface Case {
  url: string; message: string; responseStatus?: number;
  request: { method: string; url: string; headers: Record<string, string>; body: string };
  goObserved: { outcome: string };
}

it("replays Go Zulip form requests with transport-safe basic auth", async () => {
  const directory = "test/compatibility/fixtures/zulip";
  const cases = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(`${directory}/${name}`, "utf8")) as Case));
  const previous = globalThis.fetch;
  let active: Case;
  const captures: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captures.push({ url: String(url), init });
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
  expect(captures).toHaveLength(cases.length);
  for (const [index, fixture] of cases.entries()) {
    const expectedURL = new URL(fixture.request.url);
    expectedURL.username = "";
    expectedURL.password = "";
    const capture = captures[index];
    expect(capture?.url).toBe(expectedURL.href);
    expect(capture?.init?.method).toBe("POST");
    const headers = new Headers(capture?.init?.headers);
    expect(headers.get("content-type")).toBe(fixture.request.headers["content-type"]);
    expect(headers.get("authorization")).toBe(fixture.request.headers.authorization);
    expect(headers.get("accept") ?? "").toBe("");
    expect(capture?.init?.body).toBe(fixture.request.body);
  }
});

it("rejects overlong topics and messages before network I/O", async () => {
  const previous = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => { count++; return new Response("ok"); }) as typeof fetch;
  try {
    const sender = createSender("zulip://bot%40example.test:fixture-key@chat.example.test?stream=alerts");
    expect((await sender.send("hi", { topic: "🙂".repeat(61) })).map((error) => error.message))
      .toEqual(["notification delivery failed"]);
    expect((await sender.send("x".repeat(10001))).map((error) => error.message))
      .toEqual(["notification delivery failed"]);
    expect(count).toBe(0);
  } finally { globalThis.fetch = previous; }
});

it("keeps stream and topic overrides local to each send", async () => {
  const previous = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(String(init?.body)); return new Response("ok");
  }) as typeof fetch;
  try {
    const sender = createSender("zulip://bot%40example.test:fixture-key@chat.example.test?stream=alerts&topic=Base");
    expect(await sender.send("one", { stream: "override", topic: "Now" })).toEqual([]);
    expect(await sender.send("two")).toEqual([]);
  } finally { globalThis.fetch = previous; }
  expect(bodies[0]).toContain("to=override&topic=Now");
  expect(bodies[1]).toContain("to=alerts&topic=Base");
});
