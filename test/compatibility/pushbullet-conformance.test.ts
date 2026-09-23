import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { send } from "../../src/index.ts";

interface RequestCase { method: string; url: string; headers: Record<string, string>; body: unknown }
interface Case {
  url: string; message: string; responseStatus?: number;
  request: RequestCase; requests?: RequestCase[];
  goObserved: { outcome: string };
}

it("replays Go Pushbullet requests, target order, and early failure", async () => {
  const directory = "test/compatibility/fixtures/pushbullet";
  const cases = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(`${directory}/${name}`, "utf8")) as Case));
  const previous = globalThis.fetch;
  try {
    for (const fixture of cases) {
      const requests: RequestCase[] = [];
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        requests.push({
          method: init?.method ?? "", url: String(url),
          headers: { "content-type": headers.get("content-type") ?? "", "accept": headers.get("accept") ?? "", "access-token": headers.get("access-token") ?? "" },
          body: JSON.parse(String(init?.body)),
        });
        return new Response(fixture.responseStatus
          ? '{"error":{"message":"synthetic","type":"invalid","cat":"invalid"}}'
          : "{}", { status: fixture.responseStatus ?? 200 });
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

it("rejects malformed tokens and redacts fixed-endpoint errors", async () => {
  const previous = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async () => { attempts++; throw new Error("synthetic-private-host"); }) as typeof fetch;
  try {
    await expect(send("pushbullet://invalid/device1", "hello"))
      .rejects.toThrow("notification delivery failed");
    expect(attempts).toBe(0);
    await expect(send("pushbullet://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/device1", "hello"))
      .rejects.toThrow("notification delivery failed");
    expect(attempts).toBe(1);
  } finally { globalThis.fetch = previous; }
});
