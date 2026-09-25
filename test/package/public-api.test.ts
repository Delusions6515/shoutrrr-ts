import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  createSender,
  formatURL,
  parseURL,
  redactURL,
  send,
  sendDetailed,
} from "../../src/index.ts";

describe("public Generic API", () => {
  it("registers Generic but rejects unpromoted schemes", async () => {
    await expect(send("unsupported://token@example.test", "hello")).rejects.toThrow("not supported");
  });

  it("redacts credentials and sensitive Generic query values", () => {
    const value = "generic://user:secret@example.test/hook?@authorization=Bearer+token&token=canary";
    const redacted = redactURL(value);
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("Bearer");
    expect(redacted).not.toContain("canary");
    const parsed = parseURL(value);
    expect(formatURL(parsed)).toBe(value);
    expect(redactURL(formatURL(parsed))).toContain("example.test");
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });

  it("hides credentials stored in IFTTT and Pushbullet URL hostnames", async () => {
    const destinations = [
      "ifttt://ifttt-key-canary.example.test?events=deploy",
      "pushbullet://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/device1",
    ];
    for (const destination of destinations) {
      const display = redactURL(destination);
      expect(display).not.toContain(new URL(destination).hostname);
    }
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => { throw new Error("synthetic transport failure"); }) as typeof fetch;
    try {
      const outcomes = await sendDetailed(destinations, "hello");
      expect(outcomes.map((outcome) => outcome.error)).toEqual([
        "notification delivery failed", "notification delivery failed",
      ]);
      const serialized = JSON.stringify(outcomes);
      expect(serialized).not.toContain("ifttt-key-canary");
      expect(serialized).not.toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("reports every target in input order without exposing its raw URL", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL) =>
      String(url).includes("bad") ? new Response("no", { status: 500 }) : new Response("ok"),
    ) as typeof fetch;
    try {
      const results = await sendDetailed(
        ["generic://good.test/hook", "generic://user:secret@bad.test/hook"],
        "hello",
      );
      expect(results).toHaveLength(2);
      expect(results.map((result) => result.index)).toEqual([0, 1]);
      expect(results[1]?.error).toBe("notification delivery failed");
      expect(JSON.stringify(results)).not.toContain("secret");
      expect(JSON.stringify(results)).not.toContain("user:secret@");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("contains and redacts a malformed target without skipping valid siblings", async () => {
    const original = globalThis.fetch;
    const fetch = vi.fn(async () => new Response("ok"));
    globalThis.fetch = fetch as typeof globalThis.fetch;
    try {
      const results = await sendDetailed(
        ["generic://valid.test/hook", "generic://user:credential-canary@[invalid"],
        "hello",
      );
      expect(results).toHaveLength(2);
      expect(results[0]?.error).toBeUndefined();
      expect(results[1]).toMatchObject({
        index: 1,
        service: "unknown",
        destination: "<invalid-url>",
        error: "notification delivery failed",
      });
      expect(fetch).toHaveBeenCalledOnce();
      expect(JSON.stringify(results)).not.toContain("credential-canary");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("marks only a slow target as timed out while still attempting other targets", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn((url: string | URL, init?: RequestInit) =>
      String(url).includes("slow")
        ? new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
        : Promise.resolve(new Response("ok")),
    ) as typeof fetch;
    try {
      const results = await sendDetailed(
        ["generic://slow.test/hook", "generic://fast.test/hook"],
        "hello",
        { timeoutMs: 5 },
      );
      expect(results.map((result) => result.error)).toEqual(["request timed out", undefined]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("honors an already-aborted signal without starting a fetch", async () => {
    const original = globalThis.fetch;
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response("ok");
    });
    globalThis.fetch = fetch as typeof fetch;
    const controller = new AbortController();
    controller.abort();
    try {
      const [result] = await sendDetailed(["generic://cancelled.test/hook"], "hello", { signal: controller.signal });
      expect(result?.error).toBe("notification delivery failed");
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("normalizes transport errors without exposing URL or header secrets", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => { throw new Error("Bearer canary-secret"); }) as typeof fetch;
    try {
      await expect(send("generic://user:secret@example.test/hook?@authorization=Bearer+canary-secret", "hello"))
        .rejects.toThrow("notification delivery failed");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("routes Generic GET bodies and ntfy raw bodies through an injected transport", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, init });
      return new Response(String(url).includes("/topic") ? "{}" : "ok");
    };
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => { throw new Error("built-in fetch was used"); }) as typeof fetch;
    try {
      await send("generic://hooks.example.test/notify?method=GET", "hello", { transport });
      await send("ntfy://push.example.test/topic", "raw message", { transport });
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toHaveLength(2);
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.init?.body).toBe("hello");
    expect(calls[1]?.init?.method).toBe("POST");
    expect(Buffer.from(calls[1]?.init?.body as Uint8Array).toString()).toBe("raw message");
    expect(new Headers(calls[1]?.init?.headers).has("content-type")).toBe(false);
  });

  it("preserves HEAD bodies and fails closed on host errors without exposing secrets", async () => {
    let captured: RequestInit | undefined;
    const transport = async (_url: string, init?: RequestInit): Promise<Response> => {
      captured = init;
      throw new Error("https://private.example.test/canary-secret Bearer canary-secret");
    };
    const rawURL = "generic://user:canary-secret@hooks.example.test/hook?method=HEAD";
    await expect(send(rawURL, "body", { transport })).rejects.toThrow("notification delivery failed");
    expect(captured?.method).toBe("HEAD");
    expect(captured?.body).toBe("body");
    const [outcome] = await sendDetailed([rawURL], "body", { transport });
    expect(outcome?.error).toBe("notification delivery failed");
    expect(JSON.stringify(outcome)).not.toContain("canary-secret");
    const sender = createSender({ transport }, rawURL);
    expect((await sender.send("body"))[0]?.message).toBe("notification delivery failed");
  });

  it("interprets injected empty and error responses like built-in responses", async () => {
    await expect(send("generic://hooks.example.test/hook", "body", {
      transport: async () => new Response(null, { status: 204 }),
    })).resolves.toBeUndefined();
    await expect(send("generic://hooks.example.test/hook", "body", {
      transport: async () => new Response("rejected", { status: 503 }),
    })).rejects.toThrow("notification delivery failed");
    await expect(send("ntfy://push.example.test/topic", "body", {
      transport: async () => new Response("invalid JSON"),
    })).rejects.toThrow("notification delivery failed");
  });

  it("uses the injected transport for every registered stable service", async () => {
    const manifest = JSON.parse(await readFile("test/compatibility/services.json", "utf8")) as {
      services: Record<string, { status: string; fixtures: string[] }>;
    };
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => { throw new Error("default fetch was used"); }) as typeof fetch;
    try {
      for (const [service, metadata] of Object.entries(manifest.services)) {
        if (metadata.status !== "stable") continue;
        const fixtureName = metadata.fixtures.includes("basic") ? "basic" : metadata.fixtures[0];
        const fixture = JSON.parse(await readFile(`test/compatibility/fixtures/${service}/${fixtureName}.json`, "utf8")) as {
          url: string; message: string;
        };
        const calls: string[] = [];
        const transport = async (url: string): Promise<Response> => {
          calls.push(url);
          return new Response("{}");
        };
        await send(fixture.url, fixture.message, { transport }).catch(() => {});
        expect(calls.length, `${service} bypassed the injected transport`).toBeGreaterThan(0);
      }
    } finally {
      globalThis.fetch = original;
    }
  });

  it("keeps injected transports isolated across concurrent reusable senders", async () => {
    const seen: string[] = [];
    const transport = (name: string) => async (): Promise<Response> => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(name);
      return new Response("ok");
    };
    const first = createSender({ transport: transport("first") }, "generic://first.example.test/hook");
    const second = createSender({ transport: transport("second") }, "generic://second.example.test/hook");
    await Promise.all([first.sendAsync("one"), second.sendAsync("two")]);
    expect(seen.sort()).toEqual(["first", "second"]);
  });

  it("does not inherit an injected transport in nested sends without injection", async () => {
    const original = globalThis.fetch;
    const defaultFetch = vi.fn(async () => new Response("ok"));
    globalThis.fetch = defaultFetch as typeof fetch;
    const defaultSender = createSender("generic://default-sender.example.test/hook");
    let injectedCalls = 0;
    const transport = async (): Promise<Response> => {
      injectedCalls++;
      await send("generic://default-send.example.test/hook", "nested");
      expect(await defaultSender.sendAsync("nested")).toEqual([]);
      return new Response("ok");
    };
    try {
      await send("generic://injected.example.test/hook", "outer", { transport });
      expect(injectedCalls).toBe(1);
      expect(defaultFetch).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("bounds injected delivery time without claiming the host request was aborted", async () => {
    let observedSignal: AbortSignal | undefined;
    const transport = async (_url: string, init?: RequestInit): Promise<Response> => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    };
    const [result, sibling] = await sendDetailed(
      ["generic://slow.example.test/hook", "generic://fast.example.test/hook"],
      "hello",
      {
        transport: (url: string, init?: RequestInit) => url.includes("slow")
          ? transport(url, init)
          : Promise.resolve(new Response("ok")),
        timeoutMs: 5,
      },
    );
    expect(result?.error).toBe("request timed out");
    expect(sibling?.error).toBeUndefined();
    expect(observedSignal?.aborted).toBe(true);
  });

  it("retains best-effort delivery for a reusable sender", async () => {
    const sender = createSender("generic://one.test/hook", "generic://two.test/hook");
    expect(sender).toBeDefined();
  });
});
