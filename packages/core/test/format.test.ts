import { describe, expect, it } from "vitest";
import { createEnumFormatter } from "../src/enumFormatter.ts";
import {
  type FieldSchema,
  getConfigFieldString,
  parseBool,
  printBool,
  setConfigField,
} from "../src/format.ts";
import type { EnumFormatter } from "../src/types.ts";

const enums: Record<string, EnumFormatter> = {
  TestEnum: createEnumFormatter(["None", "Foo", "Bar"]),
};

describe("parseBool / printBool", () => {
  it("parses truthy values", () => {
    for (const v of ["true", "1", "yes", "y", "TRUE"]) {
      expect(parseBool(v, false)).toEqual({ value: true, ok: true });
    }
  });
  it("parses falsy values", () => {
    for (const v of ["false", "0", "no", "n"]) {
      expect(parseBool(v, true)).toEqual({ value: false, ok: true });
    }
  });
  it("returns default + ok:false for unknown", () => {
    expect(parseBool("bad", true)).toEqual({ value: true, ok: false });
  });
  it("serializes Yes/No", () => {
    expect(printBool(true)).toBe("Yes");
    expect(printBool(false)).toBe("No");
  });
});

describe("setConfigField / getConfigFieldString", () => {
  it("handles string fields", () => {
    const cfg: Record<string, unknown> = {};
    const f: FieldSchema = { name: "Str", type: "string", key: ["str"] };
    setConfigField(cfg, f, "hello", enums);
    expect(cfg.Str).toBe("hello");
    expect(getConfigFieldString(cfg, f, enums)).toBe("hello");
  });

  it("handles base-16 int fields", () => {
    const cfg: Record<string, unknown> = {};
    const f: FieldSchema = {
      name: "Code",
      type: "int",
      key: ["code"],
      base: 16,
    };
    setConfigField(cfg, f, "ff", enums);
    expect(cfg.Code).toBe(255);
    expect(getConfigFieldString(cfg, f, enums)).toBe("ff");
  });

  it("handles base-10 int fields by default", () => {
    const cfg: Record<string, unknown> = {};
    const f: FieldSchema = { name: "N", type: "int", key: ["n"] };
    setConfigField(cfg, f, "-42", enums);
    expect(cfg.N).toBe(-42);
    expect(getConfigFieldString(cfg, f, enums)).toBe("-42");
  });

  it("rejects invalid ints", () => {
    const cfg: Record<string, unknown> = {};
    const f: FieldSchema = { name: "N", type: "int", key: ["n"] };
    expect(() => setConfigField(cfg, f, "NaN", enums)).toThrow();
  });

  it("handles bool fields", () => {
    const cfg: Record<string, unknown> = {};
    const f: FieldSchema = { name: "On", type: "bool", key: ["on"] };
    setConfigField(cfg, f, "yes", enums);
    expect(cfg.On).toBe(true);
    expect(getConfigFieldString(cfg, f, enums)).toBe("Yes");
    setConfigField(cfg, f, "0", enums);
    expect(cfg.On).toBe(false);
    expect(getConfigFieldString(cfg, f, enums)).toBe("No");
    expect(() => setConfigField(cfg, f, "maybe", enums)).toThrow();
  });

  it("handles enum fields", () => {
    const cfg: Record<string, unknown> = {};
    const f: FieldSchema = {
      name: "TestEnum",
      type: "enum",
      key: ["testenum"],
      enumName: "TestEnum",
    };
    setConfigField(cfg, f, "bar", enums);
    expect(cfg.TestEnum).toBe(2);
    expect(getConfigFieldString(cfg, f, enums)).toBe("Bar");
    expect(() => setConfigField(cfg, f, "nope", enums)).toThrow();
  });

  it("handles string[] fields", () => {
    const cfg: Record<string, unknown> = {};
    const f: FieldSchema = { name: "Chats", type: "string[]", key: ["chats"] };
    setConfigField(cfg, f, "a,b,c", enums);
    expect(cfg.Chats).toEqual(["a", "b", "c"]);
    expect(getConfigFieldString(cfg, f, enums)).toBe("a,b,c");
  });

  it("honours a custom separator for string[]", () => {
    const cfg: Record<string, unknown> = {};
    const f: FieldSchema = {
      name: "Chats",
      type: "string[]",
      key: ["chats"],
      separator: ";",
    };
    setConfigField(cfg, f, "a;b", enums);
    expect(cfg.Chats).toEqual(["a", "b"]);
    expect(getConfigFieldString(cfg, f, enums)).toBe("a;b");
  });
});
