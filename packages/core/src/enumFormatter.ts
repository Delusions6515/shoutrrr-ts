/**
 * Enum formatter — port of Go `pkg/format/enum_formatter.go`.
 *
 * Names are indexed by their enum integer value. When the names list starts
 * with one or more empty strings (e.g. `["", "Foo", "Bar"]` for an enum whose
 * first real value is 1), `firstOffset` skips those leading placeholders in
 * `names()` while `print`/`parse` still operate over the full index space.
 */
import type { EnumFormatter } from "./types.ts";

/** EnumInvalid is the value returned by parse() when the input is unknown. */
export const EnumInvalid = -1;

class EnumFormatterImpl implements EnumFormatter {
  private readonly _names: string[];
  private readonly firstOffset: number;
  private readonly aliases: Record<string, number>;

  constructor(names: string[], aliases: Record<string, number>) {
    this._names = names;
    this.aliases = aliases;
    let firstOffset = 0;
    for (let i = 0; i < names.length; i++) {
      if (names[i] !== "") {
        firstOffset = i;
        break;
      }
    }
    this.firstOffset = firstOffset;
  }

  /** The list of valid enum string values (leading placeholders skipped). */
  names(): string[] {
    return this._names.slice(this.firstOffset);
  }

  /** Returns the string for an enum int value, or "Invalid" when out of range. */
  print(e: number): string {
    if (e >= this._names.length || e < 0) {
      return "Invalid";
    }
    return this._names[e] as string;
  }

  /** Returns the int for an enum string (case-insensitive), or EnumInvalid (-1). */
  parse(s: string): number {
    const target = s.toLowerCase();
    for (let index = 0; index < this._names.length; index++) {
      if (target === (this._names[index] as string).toLowerCase()) {
        return index;
      }
    }
    if (Object.hasOwn(this.aliases, s)) {
      return this.aliases[s] as number;
    }
    return EnumInvalid;
  }
}

/** Creates an EnumFormatter. Aliases are matched case-sensitively, after names. */
export function createEnumFormatter(
  names: string[],
  aliases: Record<string, number> = {},
): EnumFormatter {
  return new EnumFormatterImpl(names, aliases);
}
