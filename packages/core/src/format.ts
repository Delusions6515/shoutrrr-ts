/**
 * Config field (de)serialization — port of Go `pkg/format/formatter.go`
 * + `pkg/format/format.go`, with Go's struct reflection replaced by an
 * explicit field schema.
 *
 * Each service describes its config fields as a `FieldSchema[]`. `setConfigField`
 * parses a raw string into the typed config property; `getConfigFieldString`
 * serializes it back. This mirrors the Go SetConfigField/GetConfigFieldString
 * behaviour (bool => "Yes"/"No", enum via EnumFormatter, comma-split slices).
 */
import type { EnumFormatter } from "./types.ts";

/** Which part of a URL a field maps to (besides query params). */
export type URLPart =
  | "user"
  | "pass"
  | "host"
  | "port"
  | "path"
  | "path1"
  | "path2"
  | "path3"
  | "path4"
  | "query";

/** Supported config field value types. */
export type FieldType =
  | "string"
  | "int"
  | "uint"
  | "bool"
  | "float"
  | "enum"
  | "string[]"
  | "prop"
  | "prop[]";

/** Schema describing a single config field. */
export interface FieldSchema {
  /** Property name on the config object. */
  name: string;
  /** Value type (defaults to 'string'). */
  type?: FieldType;
  /** Query keys; key[0] is the primary key, the rest are aliases. */
  key?: string[];
  /** URL parts this field maps to. */
  urlParts?: URLPart[];
  /** Default value (as a raw string). */
  default?: string;
  /** Whether the field is required. */
  required?: boolean;
  /** Numeric base for int/uint parsing (defaults to 10). */
  base?: number;
  /** Bit width for int/uint range validation (e.g. 8 for int8/uint8). */
  bits?: number;
  /** Separator for string[] fields (defaults to ','). */
  separator?: string;
  /** Name of the EnumFormatter (looked up in the enums map) for enum fields. */
  enumName?: string;
  /** Whether the field acts as a notification title. */
  title?: boolean;
  /** Human-readable description. */
  desc?: string;
}

/** Parses "true"/"1"/"yes"/"y" => true, "false"/"0"/"no"/"n" => false. */
export function parseBool(
  value: string,
  defaultValue: boolean,
): { value: boolean; ok: boolean } {
  switch (value.toLowerCase()) {
    case "true":
    case "1":
    case "yes":
    case "y":
      return { value: true, ok: true };
    case "false":
    case "0":
    case "no":
    case "n":
      return { value: false, ok: true };
    default:
      return { value: defaultValue, ok: false };
  }
}

/** Serializes a bool as "Yes"/"No". */
export function printBool(value: boolean): string {
  return value ? "Yes" : "No";
}

/**
 * Escapes a string for a URL query component exactly like Go's
 * `url.QueryEscape`: keeps unreserved chars (`A-Za-z0-9-_.~`), encodes space as
 * `+`, and percent-encodes every other byte (UTF-8). This matches the byte
 * output of Go's `url.Values.Encode()`, which WHATWG `URLSearchParams` does not.
 */
export function goQueryEscape(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (const b of bytes) {
    if (
      (b >= 0x41 && b <= 0x5a) || // A-Z
      (b >= 0x61 && b <= 0x7a) || // a-z
      (b >= 0x30 && b <= 0x39) || // 0-9
      b === 0x2d || // -
      b === 0x5f || // _
      b === 0x2e || // .
      b === 0x7e // ~
    ) {
      out += String.fromCharCode(b);
    } else if (b === 0x20) {
      out += "+";
    } else {
      out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

function fieldType(f: FieldSchema): FieldType {
  return f.type ?? "string";
}

function parseIntStrict(
  raw: string,
  base: number,
  signed: boolean,
  bits?: number,
): number {
  // Mirror Go's strconv.ParseInt/ParseUint: reject trailing garbage and empty.
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new Error(`invalid number: ${JSON.stringify(raw)}`);
  }
  const negative = signed && trimmed.startsWith("-");
  let body = negative ? trimmed.slice(1) : trimmed;
  // Mirror Go's util.StripNumberPrefix: a 0x/0b/0o prefix selects the radix
  // (e.g. discord's `0x50d9ff` colors), overriding the schema base.
  let effectiveBase = base;
  if (body.length > 2 && body[0] === "0") {
    const prefix = body[1]?.toLowerCase();
    if (prefix === "x") {
      effectiveBase = 16;
      body = body.slice(2);
    } else if (prefix === "b") {
      effectiveBase = 2;
      body = body.slice(2);
    } else if (prefix === "o") {
      effectiveBase = 8;
      body = body.slice(2);
    }
  }
  const re =
    effectiveBase === 16
      ? /^[0-9a-fA-F]+$/
      : effectiveBase === 8
        ? /^[0-7]+$/
        : effectiveBase === 2
          ? /^[01]+$/
          : /^[0-9]+$/;
  if (!re.test(body)) {
    throw new Error(
      `invalid number ${JSON.stringify(raw)} for base ${effectiveBase}`,
    );
  }
  const n = parseInt(body, effectiveBase);
  if (Number.isNaN(n)) {
    throw new Error(`invalid number: ${JSON.stringify(raw)}`);
  }
  const value = negative ? -n : n;
  if (!signed && value < 0) {
    throw new Error(`negative value not allowed: ${JSON.stringify(raw)}`);
  }
  // Enforce the bit-width range, mirroring Go's strconv bitSize argument.
  if (bits !== undefined && bits > 0) {
    const [min, max] = signed
      ? [-(2 ** (bits - 1)), 2 ** (bits - 1) - 1]
      : [0, 2 ** bits - 1];
    if (value < min || value > max) {
      throw new Error(
        `value ${value} out of range for ${signed ? "int" : "uint"}${bits}`,
      );
    }
  }
  return value;
}

/**
 * Deserializes `raw` and assigns it to `config[f.name]` according to the field
 * schema. Throws on invalid values (matching Go's error returns).
 */
export function setConfigField(
  config: Record<string, unknown>,
  f: FieldSchema,
  raw: string,
  enums: Record<string, EnumFormatter>,
): void {
  const type = fieldType(f);

  switch (type) {
    case "string":
    case "prop":
      config[f.name] = raw;
      return;
    case "enum": {
      const enumName = f.enumName ?? f.name;
      const formatter = enums[enumName];
      if (!formatter) {
        throw new Error(`no enum formatter registered for ${enumName}`);
      }
      const value = formatter.parse(raw);
      if (value === -1) {
        throw new Error(`not a one of ${formatter.names().join(", ")}`);
      }
      config[f.name] = value;
      return;
    }
    case "int":
      config[f.name] = parseIntStrict(raw, f.base ?? 10, true, f.bits);
      return;
    case "uint":
      config[f.name] = parseIntStrict(raw, f.base ?? 10, false, f.bits);
      return;
    case "float": {
      const n = Number(raw);
      if (Number.isNaN(n) || raw.trim() === "") {
        throw new Error(`invalid float: ${JSON.stringify(raw)}`);
      }
      config[f.name] = n;
      return;
    }
    case "bool": {
      const { value, ok } = parseBool(raw, false);
      if (!ok) {
        throw new Error("accepted values are 1, true, yes or 0, false, no");
      }
      config[f.name] = value;
      return;
    }
    case "string[]":
    case "prop[]":
      config[f.name] = raw.split(f.separator ?? ",");
      return;
    default: {
      const exhaustive: never = type;
      throw new Error(`invalid field type ${String(exhaustive)}`);
    }
  }
}

/**
 * Serializes `config[f.name]` to its string representation according to the
 * field schema. Mirrors Go's GetConfigFieldString.
 */
export function getConfigFieldString(
  config: Record<string, unknown>,
  f: FieldSchema,
  enums: Record<string, EnumFormatter>,
): string {
  const type = fieldType(f);
  const value = config[f.name];

  switch (type) {
    case "string":
    case "prop":
      return value === undefined || value === null ? "" : String(value);
    case "enum": {
      const enumName = f.enumName ?? f.name;
      const formatter = enums[enumName];
      if (!formatter) {
        throw new Error(`no enum formatter registered for ${enumName}`);
      }
      return formatter.print(Number(value ?? 0));
    }
    case "int":
    case "uint": {
      const base = f.base ?? 10;
      const n = Number(value ?? 0);
      return n.toString(base);
    }
    case "float":
      return String(Number(value ?? 0));
    case "bool":
      return printBool(Boolean(value));
    case "string[]":
    case "prop[]": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return arr.join(f.separator ?? ",");
    }
    default: {
      const exhaustive: never = type;
      throw new Error(`invalid field type ${String(exhaustive)}`);
    }
  }
}
