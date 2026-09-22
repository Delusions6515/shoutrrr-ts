import { afterEach, describe, expect, it } from "vitest";
import { ApiError, JsonClient } from "../src/jsonclient.ts";

const realFetch = globalThis.fetch;

interface CapturedRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Installs a fake `fetch` that records the request and returns `response`.
 * Returns the capture slot. Restored in afterEach.
 */
function stubFetch(response: { status: number; body: string }): {
  captured?: CapturedRequest;
} {
  const slot: { captured?: CapturedRequest } = {};
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [k, v] of Object.entries(
        init.headers as Record<string, string>,
      )) {
        headers[k] = v;
      }
    }
    slot.captured = {
      url: String(input),
      method: init?.method,
      headers,
      body: init?.body === undefined ? undefined : String(init.body),
    };
    return new Response(response.body, { status: response.status });
  }) as typeof fetch;
  return slot;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("JsonClient", () => {
  it("POSTs JSON, sends headers, and parses the response", async () => {
    const slot = stubFetch({ status: 200, body: JSON.stringify({ ok: true }) });

    const client = new JsonClient();
    const res = await client.post<{ ok: boolean }>(
      "https://api.example.com/send",
      { text: "hi" },
    );

    expect(res).toEqual({ ok: true });
    expect(slot.captured?.method).toBe("POST");
    expect(slot.captured?.body).toBe(JSON.stringify({ text: "hi" }));
    expect(slot.captured?.headers["Content-Type"]).toBe("application/json");
  });

  it("throws ApiError on a non-2xx response, carrying the parsed body", async () => {
    stubFetch({ status: 401, body: JSON.stringify({ error: "bad user" }) });

    const client = new JsonClient();
    let thrown: unknown;
    try {
      await client.post("https://api.example.com/send", {});
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    const apiErr = thrown as ApiError;
    expect(apiErr.statusCode).toBe(401);
    expect(apiErr.body).toEqual({ error: "bad user" });
    expect(apiErr.message).toBe("unknown error (HTTP 401)");
  });

  it("GETs and parses JSON", async () => {
    const slot = stubFetch({
      status: 200,
      body: JSON.stringify({ version: "1" }),
    });

    const client = new JsonClient();
    const res = await client.get<{ version: string }>(
      "https://api.example.com/info",
    );
    expect(res).toEqual({ version: "1" });
    expect(slot.captured?.method).toBe("GET");
    expect(slot.captured?.body).toBeUndefined();
  });

  it("allows custom headers to be set on the client", async () => {
    const slot = stubFetch({ status: 200, body: "{}" });
    const client = new JsonClient();
    client.headers.Authorization = "Bearer t";
    await client.post("https://api.example.com/x", {});
    expect(slot.captured?.headers.Authorization).toBe("Bearer t");
  });
});
