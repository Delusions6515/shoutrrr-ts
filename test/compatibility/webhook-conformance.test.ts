import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createSender, send } from "../../src/index.ts";

type Service = "rocketchat" | "mattermost";
interface Case {
  url: string;
  message: string;
  params?: Record<string, string>;
  responseStatus?: number;
  transportFailure?: boolean;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
  goObserved: { outcome: string };
}

for (const service of ["rocketchat", "mattermost"] as const) {
  describe(`${service} Go compatibility`, () => {
    it("matches the captured request and success/failure status", async () => {
      const directory = `test/compatibility/fixtures/${service}`;
      const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
      const cases = await Promise.all(names.map(async (name) => JSON.parse(await readFile(`${directory}/${name}`, "utf8")) as Case));
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
          if (fixture.params) {
            const errors = await createSender(fixture.url).send(fixture.message, fixture.params);
            expect(errors.map((error) => error.message)).toEqual(
              fixture.goObserved.outcome === "success" ? [] : ["notification delivery failed"],
            );
          } else if (fixture.goObserved.outcome === "success") {
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

    it("rejects a missing token and redacts transport errors", async () => {
      const previous = globalThis.fetch;
      let attempts = 0;
      globalThis.fetch = (async () => { attempts++; throw new Error("synthetic-private-host"); }) as typeof fetch;
      try {
        const invalid = service === "mattermost" ? "mattermost://push.example.test/" : "rocketchat://push.example.test/one";
        await expect(send(invalid, "hello")).rejects.toThrow("notification delivery failed");
        expect(attempts).toBe(0);
        const valid = service === "mattermost"
          ? "mattermost://push.example.test/fixture-hook"
          : "rocketchat://push.example.test/fixture-a/fixture-b";
        await expect(send(valid, "hello")).rejects.toThrow("notification delivery failed");
        expect(attempts).toBe(1);
      } finally {
        globalThis.fetch = previous;
      }
    });
  });
}
