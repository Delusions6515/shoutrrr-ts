import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createSender, send } from "../../src/index.ts";

interface Case {
  url: string; message: string; responseStatus?: number; transportFailure?: boolean;
  request: { method: string; url: string; headers: Record<string, string>; body: string };
  goObserved: { outcome: string };
}

it("replays Go ntfy headers, raw message bytes, and outcomes", async () => {
  const directory = "test/compatibility/fixtures/ntfy";
  const cases = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(`${directory}/${name}`, "utf8")) as Case));
  const previous = globalThis.fetch;
  let active: Case;
  const captures: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captures.push({ url: String(url), init });
    if (active.transportFailure) throw new Error("synthetic transport failure");
    return new Response(active.responseStatus ? '{"code":503,"error":"synthetic"}' : "{}", {
      status: active.responseStatus ?? 200,
    });
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
    expectedURL.username = ""; expectedURL.password = "";
    const capture = captures[index];
    expect(capture?.url).toBe(expectedURL.href);
    expect(capture?.init?.method).toBe("POST");
    const headers = new Headers(capture?.init?.headers);
    for (const [key, value] of Object.entries(fixture.request.headers)) {
      expect(headers.get(key) ?? "").toBe(value);
    }
    expect(Buffer.from(capture?.init?.body as Uint8Array).toString()).toBe(fixture.request.body);
  }
});

it("persists Go send-time options and masks credential-bearing errors", async () => {
  const previous = globalThis.fetch;
  const priorities: string[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    priorities.push(new Headers(init?.headers).get("priority") ?? "");
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const sender = createSender("ntfy://user:fixture-key@push.example.test/topic");
    expect(await sender.send("one", { priority: "urgent" })).toEqual([]);
    expect(await sender.send("two")).toEqual([]);
    expect((await sender.send("three", { priority: "not-a-priority" })).map((error) => error.message))
      .toEqual(["notification delivery failed"]);
  } finally { globalThis.fetch = previous; }
  expect(priorities).toEqual(["Max", "Max"]);
});

it("sends untyped raw bytes without an implicit Content-Type on Node", async () => {
  let contentType = "missing";
  let body = "";
  const server = createServer((request, response) => {
    contentType = request.headers["content-type"] ?? "missing";
    request.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    request.on("end", () => { response.setHeader("content-type", "application/json"); response.end("{}"); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  try {
    await send(`ntfy://127.0.0.1:${address.port}/topic?scheme=http`, "hello");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  expect(body).toBe("hello");
  expect(contentType).toBe("missing");
});
