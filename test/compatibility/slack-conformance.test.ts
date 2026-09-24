import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createSender, send } from "../../src/index.ts";

type Case = { url: string; message: string; responseStatus?: number; responseCode?: number; transportFailure?: boolean;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown }; goObserved: { outcome: string } };

it("replays Go Slack webhook and API requests including vendor-level failure", async () => {
  const dir = "test/compatibility/fixtures/slack";
  const cases = await Promise.all((await readdir(dir)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(`${dir}/${name}`, "utf8")) as Case));
  const previous = globalThis.fetch;
  const captured: Array<{ url: string; init?: RequestInit }> = [];
  let fixture: Case;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init });
    if (fixture.transportFailure) throw new Error("synthetic-private-endpoint");
    const api = String(url).startsWith("https://slack.com/");
    const body = api ? (fixture.responseCode || (fixture.responseStatus ?? 200) >= 300
      ? '{"ok":false,"error":"synthetic"}' : '{"ok":true}') :
      (fixture.responseCode || (fixture.responseStatus ?? 200) >= 300 ? "synthetic rejection" : "ok");
    return new Response(body, { status: fixture.responseStatus ?? 200 });
  }) as typeof fetch;
  try {
    for (fixture of cases) {
      if (fixture.goObserved.outcome === "success") {
        await expect(send(fixture.url, fixture.message)).resolves.toBeUndefined();
      } else {
        await expect(send(fixture.url, fixture.message)).rejects.toThrow("notification delivery failed");
      }
    }
  } finally { globalThis.fetch = previous; }
  expect(captured).toHaveLength(cases.length);
  for (const [index, expected] of cases.entries()) {
    const actual = captured[index];
    expect(actual?.url).toBe(expected.request.url);
    expect(actual?.init?.method).toBe(expected.request.method);
    const headers = new Headers(actual?.init?.headers);
    expect(headers.get("authorization") ?? "").toBe(expected.request.headers.authorization);
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(actual?.init?.body))).toEqual(expected.request.body);
  }
});

it("keeps valid sender overrides for subsequent sends, rejects invalid tokens", async () => {
  const fixture = JSON.parse(await readFile("test/compatibility/fixtures/slack/webhook.json", "utf8")) as Case;
  const previous = globalThis.fetch;
  const titles: string[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    titles.push((JSON.parse(String(init?.body)) as { text: string }).text);
    return new Response("ok");
  }) as typeof fetch;
  try {
    await expect(send("slack://hook:invalid@webhook", "message"))
      .rejects.toThrow("notification delivery failed");
    const sender = createSender(fixture.url);
    expect(await sender.send("one", { title: "Deployment" })).toEqual([]);
    expect(await sender.send("two")).toEqual([]);
    expect(await sender.send("three", { unknown: "bad" })).toHaveLength(1);
  } finally { globalThis.fetch = previous; }
  expect(titles).toEqual(["Deployment", "Deployment"]);
});
