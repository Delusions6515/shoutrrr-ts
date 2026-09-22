/**
 * PropKeyResolver — port of Go `pkg/format/prop_key_resolver.go` +
 * `pkg/format/format_query.go`.
 *
 * Resolves config fields by their query keys, applies/reads URL parts, and
 * builds the query string (omitting any field whose serialized value equals
 * its default — exactly like Go's BuildQueryWithCustomFields + IsDefault).
 */

import {
  type FieldSchema,
  getConfigFieldString,
  goQueryEscape,
  setConfigField,
  type URLPart,
} from "./format.ts";
import type { EnumFormatter, Params, ServiceConfig } from "./types.ts";

/** Prefix used to escape custom query keys that collide with config prop keys. */
export const KEY_PREFIX = "__";

function configRecord(config: ServiceConfig): Record<string, unknown> {
  return config as unknown as Record<string, unknown>;
}

export class PropKeyResolver {
  private readonly config: ServiceConfig;
  private readonly schema: FieldSchema[];
  private readonly enums: Record<string, EnumFormatter>;
  /** Lower-cased query key -> field schema (includes aliases). */
  private readonly keyFields: Map<string, FieldSchema>;
  /** Sorted, lower-cased list of all query keys. */
  private readonly keys: string[];

  constructor(config: ServiceConfig, schema: FieldSchema[]) {
    this.config = config;
    this.schema = schema;
    this.enums = config.enums();

    this.keyFields = new Map();
    const keys: string[] = [];
    for (const field of schema) {
      for (const rawKey of field.key ?? []) {
        const key = rawKey.toLowerCase();
        if (key !== "") {
          keys.push(key);
          this.keyFields.set(key, field);
        }
      }
    }
    keys.sort();
    this.keys = keys;
  }

  /** Primary keys of query fields, sorted (includes aliases, matching Go). */
  queryFields(): string[] {
    return this.keys;
  }

  /** Whether `key` is a field's primary key (not an alias). */
  keyIsPrimary(key: string): boolean {
    const lowerKey = key.toLowerCase();
    const field = this.keyFields.get(lowerKey);
    // Compare lower-cased: Go's resolver lower-cases every key tag, so a
    // mixed-case schema key (e.g. `disableTLS`) is still its own primary key.
    return field?.key?.[0]?.toLowerCase() === lowerKey;
  }

  /** Whether `value` equals the default for `key`. */
  isDefault(key: string, value: string): boolean {
    const field = this.keyFields.get(key);
    return (field?.default ?? "") === value;
  }

  /** Reads the serialized value of the field tagged with `key`. */
  get(key: string): string {
    const field = this.keyFields.get(key.toLowerCase());
    if (!field) {
      throw new Error(`${key} is not a valid config key`);
    }
    return getConfigFieldString(configRecord(this.config), field, this.enums);
  }

  /** Sets the field tagged with `key` from its string `value`. */
  set(key: string, value: string): void {
    const field = this.keyFields.get(key.toLowerCase());
    if (!field) {
      throw new Error(
        `${key} is not a valid config key ${this.keys.join(",")}`,
      );
    }
    setConfigField(configRecord(this.config), field, value, this.enums);
  }

  /** Updates the config from the given params (first error is thrown). */
  updateConfigFromParams(params?: Params): void {
    if (!params) {
      return;
    }
    let firstError: unknown;
    for (const [key, value] of Object.entries(params)) {
      try {
        this.set(key, value);
      } catch (err) {
        if (firstError === undefined) {
          firstError = err;
        }
      }
    }
    if (firstError !== undefined) {
      throw firstError;
    }
  }

  /** Sets every tagged field to its default value. */
  setDefaultProps(): void {
    for (const field of this.schema) {
      const primary = field.key?.[0];
      if (primary === undefined || primary === "") {
        continue;
      }
      setConfigField(
        configRecord(this.config),
        field,
        field.default ?? "",
        this.enums,
      );
    }
  }

  /** Applies URL-part fields and query params from `url` to the config. */
  setFromURL(url: URL): void {
    const parts = urlPartValues(url);
    for (const field of this.schema) {
      for (const part of field.urlParts ?? []) {
        const raw = parts[part];
        if (raw !== undefined && raw !== "") {
          setConfigField(configRecord(this.config), field, raw, this.enums);
        }
      }
    }
    for (const key of this.keys) {
      const value = url.searchParams.get(key);
      if (value !== null) {
        this.set(key, value);
      }
    }
  }

  /** Writes URL-part fields and the built query string into `url`. */
  bindToURL(url: URL): void {
    for (const field of this.schema) {
      for (const part of field.urlParts ?? []) {
        const value = getConfigFieldString(
          configRecord(this.config),
          field,
          this.enums,
        );
        applyURLPart(url, part, value);
      }
    }
    url.search = this.buildQuery();
  }

  /**
   * Builds the query string from query fields, omitting aliases and any field
   * whose serialized value equals its default (port of BuildQuery + IsDefault).
   */
  buildQuery(): string {
    // Go's url.Values.Encode() emits keys in sorted order (this.keys is sorted)
    // with Go-faithful query escaping (goQueryEscape), which differs from
    // WHATWG URLSearchParams on chars like '*', '(', ')'.
    const parts: string[] = [];
    for (const key of this.keys) {
      if (!this.keyIsPrimary(key)) {
        continue;
      }
      let value: string;
      try {
        value = this.get(key);
      } catch {
        continue;
      }
      if (this.isDefault(key, value)) {
        continue;
      }
      parts.push(`${goQueryEscape(key)}=${goQueryEscape(value)}`);
    }
    return parts.join("&");
  }
}

/** decodeURIComponent that returns the input unchanged on malformed escapes. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Extracts named URL parts (port of Go urlpart mapping). */
function urlPartValues(url: URL): Record<URLPart, string> {
  const pathSegments = url.pathname.replace(/^\//, "").split("/");
  const port = url.port;
  const password = url.password;
  return {
    user: safeDecode(url.username),
    pass: safeDecode(password),
    host: url.hostname,
    port,
    path: url.pathname.replace(/^\//, ""),
    path1: pathSegments[0] ?? "",
    path2: pathSegments[1] ?? "",
    path3: pathSegments[2] ?? "",
    path4: pathSegments[3] ?? "",
    query: url.search.replace(/^\?/, ""),
  };
}

function applyURLPart(url: URL, part: URLPart, value: string): void {
  switch (part) {
    case "user":
      url.username = value;
      break;
    case "pass":
      url.password = value;
      break;
    case "host":
      url.hostname = value;
      break;
    case "port":
      url.port = value;
      break;
    case "path":
      url.pathname = `/${value}`;
      break;
    case "path1":
    case "path2":
    case "path3":
    case "path4": {
      const idx = Number(part.slice(4)) - 1;
      const segments = url.pathname.replace(/^\//, "").split("/");
      while (segments.length <= idx) {
        segments.push("");
      }
      segments[idx] = value;
      url.pathname = `/${segments.join("/")}`;
      break;
    }
    case "query":
      url.search = value;
      break;
    default: {
      const exhaustive: never = part;
      throw new Error(`unknown url part ${String(exhaustive)}`);
    }
  }
}
