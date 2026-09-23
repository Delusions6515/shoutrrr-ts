import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createSender, send } from "../../src/index.ts";

interface Case {
  url: string;
  message: string;
  responseStatus?: number;
  transportFailure?: boolean;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
  goObserved: { outcome: string };
}

it("replays Gotify requests and HTTP outcomes captured from Go", async () => {
  const names = (await readdir("test/compatibility/fixtures/gotify")).filter((name) => name.endsWith(".json")).sort();
  const cases: Case[] = await Promise.all(names.map(async (name) => JSON.parse(
    await readFile(`test/compatibility/fixtures/gotify/${name}`, "utf8"),
  ) as Case));
  const previous = globalThis.fetch;
  let active: Case;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (active.transportFailure) throw new Error("synthetic transport failure");
    return new Response(active.responseStatus
      ? '{"error":"synthetic","errorCode":503,"errorDescription":"unavailable"}'
      : '{"id":1,"appid":1,"message":"ok","title":"ok","priority":0}',
    { status: active.responseStatus ?? 200 });
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
  } finally {
    globalThis.fetch = previous;
  }
  expect(requests).toHaveLength(cases.length);
  for (const [index, fixture] of cases.entries()) {
    const actual = requests[index];
    expect(actual?.url).toBe(fixture.request.url);
    expect(actual?.init?.method).toBe(fixture.request.method);
    expect(new Headers(actual?.init?.headers).get("content-type")).toBe("application/json");
    expect(new Headers(actual?.init?.headers).get("accept") ?? "").toBe(fixture.request.headers.accept);
    expect(JSON.parse(String(actual?.init?.body))).toEqual(fixture.request.body);
  }
});

it("rejects invalid tokens before fetching and redacts transport details", async () => {
  const previous = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async () => { attempts++; throw new Error("synthetic-private-host"); }) as typeof fetch;
  try {
    await expect(send("gotify://push.example.test/invalid", "hello"))
      .rejects.toThrow("notification delivery failed");
    expect(attempts).toBe(0);
    await expect(send("gotify://push.example.test/Aaa.bbb.ccc.ddd", "hello"))
      .rejects.toThrow("notification delivery failed");
    expect(attempts).toBe(1);
  } finally {
    globalThis.fetch = previous;
  }
});

it("retains Go send-time title and priority overrides on the sender", async () => {
  const previous = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response('{"id":1}');
  }) as typeof fetch;
  try {
    const sender = createSender("gotify://push.example.test/Aaa.bbb.ccc.ddd");
    expect(await sender.send("one", { title: "Now", priority: "2" })).toEqual([]);
    expect(await sender.send("two")).toEqual([]);
  } finally {
    globalThis.fetch = previous;
  }
  expect(bodies).toMatchObject([{ title: "Now", priority: 2 }, { title: "Now", priority: 2 }]);
});
