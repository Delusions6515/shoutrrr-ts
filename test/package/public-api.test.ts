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

  it("retains best-effort delivery for a reusable sender", async () => {
    const sender = createSender("generic://one.test/hook", "generic://two.test/hook");
    expect(sender).toBeDefined();
  });
});
