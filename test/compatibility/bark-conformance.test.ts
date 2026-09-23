import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { send, createSender } from "../../src/index.ts";

interface Case {
  url: string;
  message: string;
  responseStatus?: number;
  responseCode?: number;
  transportFailure?: boolean;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
  goObserved: { outcome: string };
}

describe("Bark Go compatibility", () => {
  it("replays Go-captured requests and response outcomes", async () => {
    const files = (await readdir("test/compatibility/fixtures/bark")).filter((file) => file.endsWith(".json")).sort();
    const cases = await Promise.all(files.map(async (file) => JSON.parse(
      await readFile(`test/compatibility/fixtures/bark/${file}`, "utf8"),
    ) as Case));
    const previous = globalThis.fetch;
    let active: Case;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      if (active.transportFailure) throw new Error("synthetic transport failure");
      return new Response(JSON.stringify({ code: active.responseCode ?? 200, message: "synthetic response" }), {
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
    } finally {
      globalThis.fetch = previous;
    }
    expect(requests).toHaveLength(cases.length);
    for (const [index, fixture] of cases.entries()) {
      const captured = requests[index];
      expect(captured?.url).toBe(fixture.request.url);
      expect(captured?.init?.method).toBe(fixture.request.method);
      const headers = new Headers(captured?.init?.headers);
      expect(headers.get("content-type")).toBe(fixture.request.headers["content-type"]);
      expect(headers.get("accept") ?? "").toBe(fixture.request.headers.accept);
      expect(JSON.parse(String(captured?.init?.body))).toEqual(fixture.request.body);
    }
  });

  it("does not expose device keys or responses in public errors", async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("fixture-secret from remote"); }) as typeof fetch;
    try {
      await expect(send("bark://:fixture-secret@push.example.test", "hello"))
        .rejects.toThrow("notification delivery failed");
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("applies per-send overrides like Go without requiring a new sender", async () => {
    const previous = globalThis.fetch;
    const bodies: unknown[] = [];
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response('{"code":200,"message":"OK"}');
    }) as typeof fetch;
    try {
      const sender = createSender("bark://:fixture-device@push.example.test");
      expect(await sender.send("one", { title: "First" })).toEqual([]);
      expect(await sender.send("two")).toEqual([]);
    } finally {
      globalThis.fetch = previous;
    }
    expect(bodies).toMatchObject([{ title: "First" }, { title: "First" }]);
  });
});
