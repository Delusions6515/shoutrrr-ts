import { describe, expect, it } from "vitest";

import {
  ApiError,
  type FetchLike,
  type FieldSchema,
  goQueryEscape,
  JsonClient,
  PropKeyResolver,
  type ServiceConfig,
  setConfigField,
} from "../src/index.ts";

describe("format: bits range validation", () => {
  const enums = {};
  const intField: FieldSchema = { name: "n", type: "int", bits: 8 };
  const uintField: FieldSchema = { name: "n", type: "uint", bits: 8 };

  it("accepts in-range int8", () => {
    const c: Record<string, unknown> = {};
    setConfigField(c, intField, "100", enums);
    expect(c.n).toBe(100);
    setConfigField(c, intField, "-128", enums);
    expect(c.n).toBe(-128);
  });

  it("rejects out-of-range int8", () => {
    expect(() => setConfigField({}, intField, "200", enums)).toThrow();
    expect(() => setConfigField({}, intField, "-200", enums)).toThrow();
  });

  it("uint8 range is 0..255", () => {
    const c: Record<string, unknown> = {};
    setConfigField(c, uintField, "255", enums);
    expect(c.n).toBe(255);
    expect(() => setConfigField({}, uintField, "256", enums)).toThrow();
    expect(() => setConfigField({}, uintField, "-1", enums)).toThrow();
  });
});

describe("format: 0x/0b/0o number prefixes (Go StripNumberPrefix parity)", () => {
  const enums = {};
  it("parses 0x/0b/0o prefixes regardless of schema base", () => {
    const f: FieldSchema = { name: "n", type: "int" }; // default base 10
    const c: Record<string, unknown> = {};
    setConfigField(c, f, "0x1A", enums);
    expect(c.n).toBe(26);
    setConfigField(c, f, "0b101", enums);
    expect(c.n).toBe(5);
    setConfigField(c, f, "0o17", enums);
    expect(c.n).toBe(15);
    setConfigField(c, f, "42", enums); // still plain decimal
    expect(c.n).toBe(42);
  });
  it("accepts a hex color like 0x50d9ff (discord)", () => {
    const f: FieldSchema = { name: "color", type: "uint" };
    const c: Record<string, unknown> = {};
    setConfigField(c, f, "0x50d9ff", enums);
    expect(c.color).toBe(0x50d9ff);
  });
});

describe("PropKeyResolver: mixed-case primary keys (keyIsPrimary)", () => {
  class Cfg implements ServiceConfig {
    disableTLS = false;
    getURL(): URL {
      return new URL("x://");
    }
    setURL(): void {}
    enums(): Record<string, never> {
      return {};
    }
  }
  const schema: FieldSchema[] = [
    { name: "disableTLS", type: "bool", key: ["disableTLS"], default: "No" },
  ];

  it("emits a mixed-case-keyed field in buildQuery() (not dropped)", () => {
    const cfg = new Cfg();
    cfg.disableTLS = true; // non-default => should be emitted
    const resolver = new PropKeyResolver(cfg, schema);
    expect(resolver.keyIsPrimary("disabletls")).toBe(true);
    expect(resolver.buildQuery()).toBe("disabletls=Yes");
  });
});

describe("goQueryEscape (Go url.QueryEscape parity)", () => {
  it("encodes space as + and reserved chars as %XX, keeps unreserved", () => {
    expect(goQueryEscape("a b")).toBe("a+b");
    expect(goQueryEscape("*")).toBe("%2A");
    expect(goQueryEscape("(x)")).toBe("%28x%29");
    expect(goQueryEscape("a-b_c.d~e")).toBe("a-b_c.d~e");
    expect(goQueryEscape("café")).toBe("caf%C3%A9");
  });
});

describe("JsonClient injectable fetch", () => {
  function recordingFetch(
    status: number,
    body: string,
  ): { fetch: FetchLike; calls: Array<{ url: string; init?: RequestInit }> } {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch: FetchLike = async (
      url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url, init });
      return new Response(status === 204 ? null : body, { status });
    };
    return { fetch, calls };
  }

  it("post sends JSON and parses the JSON response", async () => {
    const { fetch, calls } = recordingFetch(200, JSON.stringify({ ok: true }));
    const client = new JsonClient({ fetch });
    const res = await client.post<{ ok: boolean }>("https://x/y", { a: 1 });
    expect(res).toEqual({ ok: true });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ a: 1 });
  });

  it("put uses the PUT method", async () => {
    const { fetch, calls } = recordingFetch(200, "");
    await new JsonClient({ fetch }).put("https://x", { b: 2 });
    expect(calls[0]?.init?.method).toBe("PUT");
  });

  it("postForm sends form-urlencoded body", async () => {
    const { fetch, calls } = recordingFetch(
      200,
      JSON.stringify({ result: "success" }),
    );
    const res = await new JsonClient({ fetch }).postForm<{ result: string }>(
      "https://x",
      { to: "a@b", content: "hi there" },
    );
    expect(res).toEqual({ result: "success" });
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(String(calls[0]?.init?.body)).toBe("to=a%40b&content=hi+there");
  });

  it("throws ApiError with the parsed body on non-2xx", async () => {
    const { fetch } = recordingFetch(400, JSON.stringify({ error: "bad" }));
    const client = new JsonClient({ fetch });
    await expect(client.post("https://x", {})).rejects.toBeInstanceOf(ApiError);
  });

  it("tolerates empty (204) bodies", async () => {
    const { fetch } = recordingFetch(204, "");
    const res = await new JsonClient({ fetch }).post("https://x", {});
    expect(res).toBeUndefined();
  });

  it("request() is a raw escape hatch that does not throw on non-2xx", async () => {
    const { fetch } = recordingFetch(500, "nope");
    const res = await new JsonClient({ fetch }).request("POST", "https://x", {
      body: "raw",
      contentType: "text/plain",
    });
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("nope");
  });
});
