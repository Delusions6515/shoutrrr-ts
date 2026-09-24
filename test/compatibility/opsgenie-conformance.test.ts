import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createSender, send } from "../../src/index.ts";

type Case = { url: string; message: string; params?: Record<string, string>; responseStatus?: number; transportFailure?: boolean;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown }; goObserved: { outcome: string } };

it("replays Go OpsGenie requests, options, and failures", async () => {
  const dir = "test/compatibility/fixtures/opsgenie";
  const fixtures = await Promise.all((await readdir(dir)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(`${dir}/${name}`, "utf8")) as Case));
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let fixture: Case;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (fixture.transportFailure) throw new Error("secret vendor body and private host");
    return new Response("synthetic response", { status: fixture.responseStatus ?? 200 });
  }) as typeof fetch;
  try {
    for (fixture of fixtures) {
      if (fixture.goObserved.outcome === "success") {
        if (fixture.params) {
          await expect(createSender(fixture.url).send(fixture.message, fixture.params)).resolves.toEqual([]);
        } else {
          await expect(send(fixture.url, fixture.message)).resolves.toBeUndefined();
        }
      } else {
        await expect(send(fixture.url, fixture.message)).rejects.toThrow("notification delivery failed");
      }
    }
  } finally { globalThis.fetch = original; }
  expect(calls).toHaveLength(fixtures.length);
  for (const [index, item] of fixtures.entries()) {
    const call = calls[index];
    expect(call?.url).toBe(item.request.url);
    expect(call?.init?.method).toBe(item.request.method);
    expect(new Headers(call?.init?.headers).get("authorization")).toBe(item.request.headers.authorization);
    expect(new Headers(call?.init?.headers).get("content-type")).toBe(item.request.headers["content-type"]);
    expect(JSON.parse(String(call?.init?.body))).toEqual(item.request.body);
  }
});

it("rejects invalid overrides before transport and does not persist send-time values", async () => {
  const fixture = JSON.parse(await readFile("test/compatibility/fixtures/opsgenie/basic.json", "utf8")) as Case;
  const original = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body))); return new Response("accepted", { status: 202 });
  }) as typeof fetch;
  try {
    const sender = createSender(fixture.url);
    expect(await sender.send("first", { alias: "one" })).toEqual([]);
    expect(await sender.send("second")).toEqual([]);
    expect(await sender.send("third", { respondents: "invalid" })).toHaveLength(1);
  } finally { globalThis.fetch = original; }
  expect(bodies).toEqual([{ message: "first", alias: "one" }, { message: "second" }]);
});
