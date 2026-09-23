import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { send } from "../../src/index.ts";

interface Case {
  url: string; message: string; responseStatus?: number; transportFailure?: boolean;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
  goObserved: { outcome: string };
}

it("replays Google Chat and Hangouts-alias Go requests", async () => {
  const directory = "test/compatibility/fixtures/googlechat";
  const cases = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(`${directory}/${name}`, "utf8")) as Case));
  const previous = globalThis.fetch;
  let active: Case;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (active.transportFailure) throw new Error("synthetic transport failure");
    return new Response(null, { status: active.responseStatus ?? 200 });
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
  expect(requests).toHaveLength(cases.length);
  for (const [index, fixture] of cases.entries()) {
    const actual = requests[index];
    expect(actual?.url).toBe(fixture.request.url);
    expect(actual?.init?.method).toBe("POST");
    expect(new Headers(actual?.init?.headers).get("content-type")).toBe("application/json");
    expect(new Headers(actual?.init?.headers).get("accept") ?? "").toBe("");
    expect(JSON.parse(String(actual?.init?.body))).toEqual(fixture.request.body);
  }
});

it("rejects a missing key before sending but permits a missing token like pinned Go", async () => {
  const previous = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => { count++; return new Response(null); }) as typeof fetch;
  try {
    await expect(send("googlechat://chat.example.test/hook?token=fixture-token", "hello"))
      .rejects.toThrow("notification delivery failed");
    expect(count).toBe(0);
    await expect(send("googlechat://chat.example.test/hook?key=fixture-key", "hello"))
      .resolves.toBeUndefined();
    expect(count).toBe(1);
  } finally { globalThis.fetch = previous; }
});
