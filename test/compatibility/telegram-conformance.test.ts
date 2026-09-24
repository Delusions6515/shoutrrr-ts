import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createSender, send, sendDetailed } from "../../src/index.ts";

type Request = { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> };
type Case = { url: string; message: string; responseStatus?: number; responseCode?: number;
  transportFailure?: boolean; request: Request; requests?: Request[]; goObserved: { outcome: string } };

it("replays pinned Go Telegram single-chat, multi-chat and failure observations", async () => {
  const dir = "test/compatibility/fixtures/telegram";
  const cases = await Promise.all((await readdir(dir)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(`${dir}/${name}`, "utf8")) as Case));
  const previous = globalThis.fetch;
  const captured: Array<{ url: string; init?: RequestInit }> = [];
  let fixture: Case;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init });
    if (fixture.transportFailure) throw new Error("synthetic-private-endpoint");
    const failed = fixture.responseCode || (fixture.responseStatus ?? 200) >= 300;
    return new Response(failed ? '{"ok":false,"error_code":400,"description":"synthetic"}' : '{"ok":true,"result":{"message_id":1,"text":"ok"}}',
      { status: fixture.responseStatus ?? 200 });
  }) as typeof fetch;
  try {
    for (fixture of cases) {
      captured.length = 0;
      if (fixture.goObserved.outcome === "success") {
        await expect(send(fixture.url, fixture.message)).resolves.toBeUndefined();
      } else {
        await expect(send(fixture.url, fixture.message)).rejects.toThrow("notification delivery failed");
      }
      const expected = fixture.requests ?? [fixture.request];
      expect(captured).toHaveLength(expected.length);
      for (const [index, request] of expected.entries()) {
        expect(captured[index]?.url).toBe(request.url);
        expect(captured[index]?.init?.method).toBe(request.method);
        expect(new Headers(captured[index]?.init?.headers).get("content-type")).toBe(request.headers["content-type"]);
        expect(JSON.parse(String(captured[index]?.init?.body))).toEqual(request.body);
      }
    }
  } finally { globalThis.fetch = previous; }
});

it("rejects malformed configuration without leaking tokens and keeps Go's original chat list", async () => {
  await expect(send("telegram://12345:private-token@telegram?chats=", "hello"))
    .rejects.toThrow("notification delivery failed");
  await expect(send("telegram://bad:private-token@telegram?chats=123", "hello"))
    .rejects.toThrow("notification delivery failed");
  const previous = globalThis.fetch;
  const chats: string[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    chats.push(String((JSON.parse(String(init?.body)) as { chat_id: string }).chat_id));
    return new Response('{"ok":true}');
  }) as typeof fetch;
  try {
    const sender = createSender("telegram://12345:synthetic@telegram?chats=123");
    expect(await sender.send("one", { chats: "456", title: "Alert" })).toEqual([]);
    expect(await sender.send("two")).toEqual([]);
    expect(await sender.send("three", { unknown: "private-token" })).toHaveLength(1);
    expect(await sender.send("x".repeat(4097))).toHaveLength(1);
  } finally { globalThis.fetch = previous; }
  expect(chats).toEqual(["123", "123"]);
});

it("keeps Telegram tokens and chat IDs out of public failure results", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("synthetic-private-endpoint"); }) as typeof fetch;
  try {
    const results = await sendDetailed(
      ["telegram://12345:secret-canary@telegram?chats=private-chat-canary"], "hello",
    );
    const output = JSON.stringify(results);
    expect(results).toHaveLength(1);
    expect(results[0]?.error).toBe("notification delivery failed");
    expect(output).not.toContain("secret-canary");
    expect(output).not.toContain("private-chat-canary");
    expect(output).not.toContain("synthetic-private-endpoint");
  } finally { globalThis.fetch = previous; }
});
