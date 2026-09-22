import { describe, expect, it } from "vitest";
import type { FieldSchema } from "../src/format.ts";
import { PropKeyResolver } from "../src/propKeyResolver.ts";
import type { EnumFormatter, ServiceConfig } from "../src/types.ts";

const schema: FieldSchema[] = [
  { name: "Str", type: "string", key: ["str"], default: "notempty" },
  { name: "Num", type: "int", key: ["num"], default: "0" },
  { name: "Host", type: "string", urlParts: ["host"] },
];

class FakeConfig implements ServiceConfig {
  Str = "notempty";
  Num = 0;
  Host = "";
  getURL(): URL {
    return new URL("fake://host");
  }
  setURL(_u: URL): void {}
  enums(): Record<string, EnumFormatter> {
    return {};
  }
}

describe("PropKeyResolver", () => {
  it("lists query field keys sorted", () => {
    const pkr = new PropKeyResolver(new FakeConfig(), schema);
    expect(pkr.queryFields()).toEqual(["num", "str"]);
  });

  it("omits default-valued fields from the query", () => {
    const cfg = new FakeConfig();
    const pkr = new PropKeyResolver(cfg, schema);
    expect(pkr.buildQuery()).toBe("");
    cfg.Str = "test";
    expect(pkr.buildQuery()).toBe("str=test");
  });

  it("reads url-part fields and query params from a URL", () => {
    const cfg = new FakeConfig();
    const pkr = new PropKeyResolver(cfg, schema);
    pkr.setFromURL(new URL("fake://example.com/?str=fromquery&num=7"));
    expect(cfg.Host).toBe("example.com");
    expect(cfg.Str).toBe("fromquery");
    expect(cfg.Num).toBe(7);
  });

  it("binds url-part fields and query into a URL", () => {
    const cfg = new FakeConfig();
    cfg.Str = "changed";
    cfg.Host = "bound.example";
    const pkr = new PropKeyResolver(cfg, schema);
    const url = new URL("fake://placeholder");
    pkr.bindToURL(url);
    expect(url.hostname).toBe("bound.example");
    expect(url.searchParams.get("str")).toBe("changed");
    expect(url.searchParams.get("num")).toBeNull();
  });

  it("does not crash on credentials with malformed percent escapes", () => {
    const cfg = new FakeConfig();
    const userSchema: FieldSchema[] = [
      { name: "Str", type: "string", urlParts: ["user"] },
    ];
    const pkr = new PropKeyResolver(cfg, userSchema);
    expect(() => pkr.setFromURL(new URL("fake://a%b@host/"))).not.toThrow();
    expect(cfg.Str).toBe("a%b");
  });

  it("updates the config from params", () => {
    const cfg = new FakeConfig();
    const pkr = new PropKeyResolver(cfg, schema);
    pkr.updateConfigFromParams({ str: "p", num: "9" });
    expect(cfg.Str).toBe("p");
    expect(cfg.Num).toBe(9);
  });
});
