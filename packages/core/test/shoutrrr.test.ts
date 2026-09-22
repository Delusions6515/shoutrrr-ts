import { describe, expect, it } from "vitest";
import { registerService } from "../src/router.ts";
import { createSender, newSender, send } from "../src/shoutrrr.ts";
import { Standard } from "../src/standard.ts";
import type { Logger, Params, Service } from "../src/types.ts";

const received: Array<{ message: string; params?: Params }> = [];

class CapturingService extends Standard implements Service {
  initialize(_url: URL): void {}
  async send(message: string, params?: Params): Promise<void> {
    received.push({ message, params });
  }
}

registerService("cap", () => new CapturingService());

describe("top-level API", () => {
  it("send() routes a single message", async () => {
    received.length = 0;
    await send("cap://host", "one");
    expect(received).toEqual([{ message: "one", params: undefined }]);
  });

  it("createSender() builds a router over multiple URLs", async () => {
    received.length = 0;
    const router = createSender("cap://a", "cap://b");
    const errors = await router.send("multi");
    expect(errors).toEqual([]);
    expect(received).toHaveLength(2);
  });

  it("newSender() accepts a logger", async () => {
    const logger: Logger = { logf: () => {} };
    const router = newSender(logger, "cap://a");
    const errors = await router.send("x");
    expect(errors).toEqual([]);
  });
});
