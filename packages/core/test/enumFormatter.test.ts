import { describe, expect, it } from "vitest";
import { createEnumFormatter, EnumInvalid } from "../src/enumFormatter.ts";

describe("createEnumFormatter", () => {
  const ef = createEnumFormatter(["None", "Foo", "Bar"]);

  it("lists all names", () => {
    expect(ef.names()).toEqual(["None", "Foo", "Bar"]);
  });

  it("round-trips parse/print", () => {
    expect(ef.parse("Foo")).toBe(1);
    expect(ef.print(1)).toBe("Foo");
    expect(ef.print(ef.parse("Bar"))).toBe("Bar");
  });

  it("parses case-insensitively", () => {
    expect(ef.parse("fOo")).toBe(1);
  });

  it("returns -1 for unknown values", () => {
    expect(ef.parse("Nope")).toBe(EnumInvalid);
    expect(ef.parse("Nope")).toBe(-1);
  });

  it('returns "Invalid" for out-of-range values', () => {
    expect(ef.print(99)).toBe("Invalid");
    expect(ef.print(-1)).toBe("Invalid");
  });

  it("honours leading-empty offset in names()", () => {
    const offset = createEnumFormatter(["", "One", "Two"]);
    expect(offset.names()).toEqual(["One", "Two"]);
    expect(offset.parse("One")).toBe(1);
    expect(offset.print(1)).toBe("One");
  });

  it("resolves aliases case-sensitively", () => {
    const aliased = createEnumFormatter(["None", "Foo"], { F: 1 });
    expect(aliased.parse("F")).toBe(1);
    expect(aliased.parse("f")).toBe(-1);
  });
});
