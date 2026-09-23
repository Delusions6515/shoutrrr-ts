import { readdir, readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { send } from "../../src/index.ts";

interface RequestCase { method: string; url: string; headers: Record<string, string>; body: unknown }
interface Case {
  url: string; message: string; responseStatus?: number;
  request: RequestCase; requests?: RequestCase[]; goObserved: { outcome: string };
}

it("matches IFTTT Go event order, payloads, and first-error stop", async () => {
  const directory = "test/compatibility/fixtures/ifttt";
  const cases = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(`${directory}/${name}`, "utf8")) as Case));
  const previous = globalThis.fetch;
  try {
    for (const fixture of cases) {
      const requests: RequestCase[] = [];
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        requests.push({ method: init?.method ?? "", url: String(url), headers: {
          "content-type": headers.get("content-type") ?? "", "accept": headers.get("accept") ?? "",
        }, body: JSON.parse(String(init?.body)) });
        return new Response("ok", { status: fixture.responseStatus ?? 200 });
      }) as typeof fetch;
      if (fixture.goObserved.outcome === "success") {
        await expect(send(fixture.url, fixture.message)).resolves.toBeUndefined();
      } else {
        await expect(send(fixture.url, fixture.message)).rejects.toThrow("notification delivery failed");
      }
      expect(requests).toEqual(fixture.requests ?? [fixture.request]);
    }
  } finally { globalThis.fetch = previous; }
});

it("rejects invalid event configuration without exposing the payload to stdout", async () => {
  const previous = globalThis.fetch;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  let count = 0;
  globalThis.fetch = (async () => { count++; return new Response("ok"); }) as typeof fetch;
  try {
    await expect(send("ifttt://fixture-key.example.test?events=deploy&messagevalue=4", "hello"))
      .rejects.toThrow("notification delivery failed");
    await expect(send("ifttt://fixture-key.example.test", "hello"))
      .rejects.toThrow("notification delivery failed");
    expect(count).toBe(0);
    await expect(send("ifttt://fixture-key.example.test?events=deploy", "message-canary"))
      .resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  } finally { globalThis.fetch = previous; log.mockRestore(); }
});
