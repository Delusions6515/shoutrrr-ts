import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { send } from "../../src/index.ts";

interface Fixture {
  url: string;
  message: string;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
}

describe("Generic Webhook compatibility fixtures", () => {
  it("matches the documented Generic request contracts", async () => {
    const fixtureDirectory = "test/compatibility/fixtures/generic";
    const fixtures = await Promise.all((await readdir(fixtureDirectory))
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => JSON.parse(await readFile(`${fixtureDirectory}/${file}`, "utf8")) as Fixture));
    const original = globalThis.fetch;
    const captures: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captures.push({ url, init });
      return new Response("ok");
    }) as typeof globalThis.fetch;
    try {
      for (const fixture of fixtures) await send(fixture.url, fixture.message);
    } finally {
      globalThis.fetch = original;
    }
    for (const [index, fixture] of fixtures.entries()) {
      const captured = captures[index];
      expect(captured).toBeDefined();
      expect(String(captured?.url)).toBe(fixture.request.url);
      expect(captured?.init?.method).toBe(fixture.request.method);
      expect(Object.fromEntries(new Headers(captured?.init?.headers))).toMatchObject(fixture.request.headers);
      const capturedBody = String(captured?.init?.body);
      expect(typeof fixture.request.body === "string" ? capturedBody : JSON.parse(capturedBody))
        .toEqual(fixture.request.body);
    }
  });

  it("sends the payload body with a configured GET request", async () => {
    let capturedMethod = "";
    let capturedBody = "";
    const server = createServer((request, response) => {
      capturedMethod = request.method ?? "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        capturedBody += chunk;
      });
      request.on("end", () => response.end("ok"));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not expose a TCP port");
    try {
      await send(
        `generic://127.0.0.1:${address.port}/notify?disabletls=yes&method=GET`,
        "hello",
      );
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    expect(capturedMethod).toBe("GET");
    expect(capturedBody).toBe("hello");
  });

  it("follows trusted Generic redirects like the Go baseline", async () => {
    let finalMethod = "";
    const server = createServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { location: "/final" });
        response.end();
        return;
      }
      finalMethod = request.method ?? "";
      request.resume();
      request.on("end", () => response.end("ok"));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not expose a TCP port");
    try {
      await send(`generic+http://127.0.0.1:${address.port}/redirect`, "hello");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    expect(finalMethod).toBe("GET");
  });

  it("uses HTTP only when the Generic shortcut explicitly selects it", async () => {
    const original = globalThis.fetch;
    let destination = "";
    globalThis.fetch = (async (url: string | URL | Request) => {
      destination = String(url);
      return new Response("ok");
    }) as typeof globalThis.fetch;
    try {
      await send("generic+http://hooks.example.test/notify", "hello");
    } finally {
      globalThis.fetch = original;
    }
    expect(destination).toBe("http://hooks.example.test/notify");
  });
});
