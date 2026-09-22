import { describe, expect, it } from "vitest";
import {
  extractScheme,
  getServiceFactory,
  registerService,
  ServiceRouter,
} from "../src/router.ts";
import { Standard } from "../src/standard.ts";
import type { Params, Service } from "../src/types.ts";

/** Inline fake service that records sends and can be made to fail. */
class FakeService extends Standard implements Service {
  static last?: FakeService;
  sent: Array<{ message: string; params?: Params }> = [];
  fail = false;

  initialize(url: URL): void {
    this.fail = url.searchParams.get("fail") === "true";
    FakeService.last = this;
  }

  async send(message: string, params?: Params): Promise<void> {
    if (this.fail) {
      throw new Error(`fake send failed: ${message}`);
    }
    this.sent.push({ message, params });
  }
}

registerService("fake", () => new FakeService());

describe("extractScheme", () => {
  it("lower-cases and strips the +suffix", () => {
    expect(extractScheme("slack+x://token@host")).toBe("slack");
    expect(extractScheme("SLACK://token@host")).toBe("slack");
    expect(extractScheme("fake://host")).toBe("fake");
  });
});

describe("registry", () => {
  it("looks up registered factories case-insensitively", () => {
    expect(getServiceFactory("FAKE")).toBeDefined();
    expect(getServiceFactory("missing")).toBeUndefined();
  });
});

describe("ServiceRouter", () => {
  it("locate() throws for unknown schemes", () => {
    const router = new ServiceRouter();
    expect(() => router.locate("nope://host")).toThrow();
  });

  it("send() delivers to all services and collects no errors on success", async () => {
    const router = new ServiceRouter();
    router.addService("fake://host");
    router.addService("fake://host2");
    const errors = await router.send("hello", { k: "v" });
    expect(errors).toEqual([]);
  });

  it("send() collects errors from failing services", async () => {
    const router = new ServiceRouter();
    router.addService("fake://host?fail=true");
    router.addService("fake://host2");
    const errors = await router.send("hello");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("fake send failed");
  });

  it("sendAsync() collects errors from failing services", async () => {
    const router = new ServiceRouter();
    router.addService("fake://host?fail=true");
    const errors = await router.sendAsync("hello");
    expect(errors).toHaveLength(1);
  });
});
