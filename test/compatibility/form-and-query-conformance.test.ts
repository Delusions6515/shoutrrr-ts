import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createSender, send } from "../../src/index.ts";

type Service = "pushover" | "join";
interface Case {
  url: string;
  message: string;
  responseStatus?: number;
  transportFailure?: boolean;
  request: { method: string; url: string; headers: Record<string, string>; body: string };
  goObserved: { outcome: string };
}

for (const service of ["pushover", "join"] as const) {
  describe(`${service} Go compatibility`, () => {
    it("matches Go's encoded request and response-status rule", async () => {
      const directory = `test/compatibility/fixtures/${service}`;
      const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
      const cases = await Promise.all(files.map(async (name) => JSON.parse(await readFile(`${directory}/${name}`, "utf8")) as Case));
      const previous = globalThis.fetch;
      let active: Case;
      const requests: Array<{ url: string; init?: RequestInit }> = [];
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init });
        if (active.transportFailure) throw new Error("synthetic transport failure");
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
      } finally {
        globalThis.fetch = previous;
      }
      expect(requests).toHaveLength(cases.length);
      for (const [index, fixture] of cases.entries()) {
        const actual = requests[index];
        expect(actual?.url).toBe(fixture.request.url);
        expect(actual?.init?.method).toBe(fixture.request.method);
        expect(new Headers(actual?.init?.headers).get("content-type")).toBe(fixture.request.headers["content-type"]);
        expect(new Headers(actual?.init?.headers).get("accept") ?? "").toBe(fixture.request.headers.accept);
        expect(String(actual?.init?.body ?? "")).toBe(fixture.request.body);
      }
    });

    it("rejects missing required fields without a request", async () => {
      const previous = globalThis.fetch;
      let attempts = 0;
      globalThis.fetch = (async () => { attempts++; return new Response("ok"); }) as typeof fetch;
      try {
        const invalid = service === "join" ? "join://Token:key@join" : "pushover://Token@user.example.test";
        await expect(send(invalid, "hello")).rejects.toThrow("notification delivery failed");
        expect(attempts).toBe(0);
      } finally {
        globalThis.fetch = previous;
      }
    });

    it("masks synthetic credentials and remote failures in public outcomes", async () => {
      const previous = globalThis.fetch;
      globalThis.fetch = (async () => { throw new Error("fixture-secret from remote"); }) as typeof fetch;
      try {
        const url = service === "join"
          ? "join://Token:fixture-secret@join?devices=phone"
          : "pushover://Token:fixture-secret@fixture-user.example.test";
        const [result] = await Promise.all([send(url, "hello").then(() => "ok", (error: Error) => error.message)]);
        expect(result).toBe("notification delivery failed");
      } finally { globalThis.fetch = previous; }
    });
  });
}

it("uses Join's per-send title override without mutating configuration", async () => {
  const previous = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => { urls.push(String(url)); return new Response("ok"); }) as typeof fetch;
  try {
    const sender = createSender("join://Token:fixture-key@join?devices=phone&title=Default");
    expect(await sender.send("one", { title: "Override" })).toEqual([]);
    expect(await sender.send("two")).toEqual([]);
  } finally { globalThis.fetch = previous; }
  expect(urls[0]).toContain("title=Override");
  expect(urls[1]).toContain("title=Default");
});
