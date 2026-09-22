import {
  EnumlessConfig,
  type FieldSchema,
  goQueryEscape,
  PropKeyResolver,
} from "@shoutrrr-ts/core-internal";
import {
  buildQueryWithCustomFields,
  setConfigPropsFromQuery,
} from "./customFields.ts";
import {
  appendCustomQueryValues,
  stripCustomQueryValues,
} from "./customQuery.ts";

/** Scheme is the identifying part of this service's configuration URL. */
export const Scheme = "generic";
/** DefaultWebhookScheme is the scheme used for webhook URLs unless overridden. */
export const DefaultWebhookScheme = "https";

/** Internal placeholder scheme used to parse URLs as "non-special" so empty paths are preserved (Go semantics). */
const PLACEHOLDER_SCHEME = "shoutrrrx";

/**
 * Field schema for the generic Config, ported from the Go struct tags in generic_config.go.
 * Property `name` matches the Config property; `key` is the URL query key.
 */
export const configSchema: FieldSchema[] = [
  {
    name: "contentType",
    key: ["contenttype"],
    default: "application/json",
    desc: "The value of the Content-Type header",
  },
  { name: "disableTLS", key: ["disabletls"], type: "bool", default: "No" },
  {
    name: "template",
    key: ["template"],
    default: "",
    desc: "The template used for creating the request payload",
  },
  { name: "title", key: ["title"], default: "" },
  {
    name: "titleKey",
    key: ["titlekey"],
    default: "title",
    desc: "The key that will be used for the title value",
  },
  {
    name: "messageKey",
    key: ["messagekey"],
    default: "message",
    desc: "The key that will be used for the message value",
  },
  { name: "requestMethod", key: ["method"], default: "POST" },
];

/** Splits a raw URL string into its scheme and a non-special WHATWG URL of the remainder. */
function parseURLPreservingPath(raw: string): { scheme: string; url: URL } {
  const match = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  const scheme = match ? (match[1] as string) : "";
  const rest = raw.slice(scheme.length + 1);
  return { scheme, url: new URL(`${PLACEHOLDER_SCHEME}:${rest}`) };
}

/** Encodes query values using Go's sorted url.Values.Encode semantics. */
function encodeGoQuery(query: URLSearchParams): string {
  const values = new Map<string, string[]>();
  for (const [key, value] of query) {
    const existing = values.get(key);
    if (existing) {
      existing.push(value);
    } else {
      values.set(key, [value]);
    }
  }
  return [...values.keys()]
    .sort((left, right) => compareUTF8(left, right))
    .flatMap((key) => (values.get(key) ?? []).map(
      (value) => `${goQueryEscape(key)}=${goQueryEscape(value)}`,
    ))
    .join("&");
}

function compareUTF8(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index++) {
    const difference = (leftBytes[index] as number) - (rightBytes[index] as number);
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

/** Reconstructs a URL string with the given scheme, preserving authority/path/query/hash. */
function buildURLString(base: URL, scheme: string, rawQuery: string): string {
  let out = `${scheme}://`;
  // Render userinfo whenever a username OR password is present (Go renders ":pass@" for password-only).
  if (base.username || base.password) {
    out += base.username;
    if (base.password) {
      out += `:${base.password}`;
    }
    out += "@";
  }
  out += base.host;
  out += base.pathname;
  if (rawQuery.length > 0) {
    out += `?${rawQuery}`;
  }
  out += base.hash;
  return out;
}

/** Config for the generic webhook service. Faithful port of Go `generic.Config`. */
export class Config extends EnumlessConfig {
  /** Non-special URL holding the webhook authority and path. */
  webhookURL: URL;
  /** Query bytes used for the outbound webhook URL. Shortcut URLs retain their original encoding. */
  webhookRawQuery = "";
  headers: Record<string, string> = {};
  extraData: Record<string, string> = {};

  // Prop fields (defaults applied via PropKeyResolver.setDefaultProps).
  contentType = "application/json";
  disableTLS = false;
  template = "";
  title = "";
  titleKey = "title";
  messageKey = "message";
  requestMethod = "POST";

  constructor() {
    super();
    this.webhookURL = new URL(`${PLACEHOLDER_SCHEME}://localhost`);
  }

  /** WebhookURL returns the upstream URL string, applying disableTLS to pick http/https. */
  webhookURLString(): string {
    const scheme = this.disableTLS ? "http" : DefaultWebhookScheme;
    return buildURLString(this.webhookURL, scheme, this.webhookRawQuery);
  }

  /** getURL returns the `generic://` service URL representation of the current config. */
  getURL(): URL {
    const resolver = new PropKeyResolver(this as never, configSchema);
    return this.getURLWith(resolver);
  }

  getURLWith(resolver: PropKeyResolver): URL {
    // A service URL is always normalized like Go's url.Values.Encode.
    const serviceQuery = new URLSearchParams(this.webhookRawQuery);
    buildQueryWithCustomFields(resolver, serviceQuery);
    appendCustomQueryValues(serviceQuery, this.headers, this.extraData);
    return new URL(
      buildURLString(this.webhookURL, Scheme, encodeGoQuery(serviceQuery)),
    );
  }

  /** setURL updates the config from a `generic://` service URL. */
  setURL(serviceURL: URL): void {
    const resolver = new PropKeyResolver(this as never, configSchema);
    this.setURLWith(resolver, serviceURL);
  }

  setURLWith(resolver: PropKeyResolver, serviceURL: URL): void {
    const { url: webhookURL } = parseURLPreservingPath(serviceURL.href);
    const serviceQuery = new URLSearchParams(serviceURL.searchParams);
    const { headers, extraData } = stripCustomQueryValues(serviceQuery);
    const customQuery = setConfigPropsFromQuery(resolver, serviceQuery);
    webhookURL.search = "";
    this.webhookURL = webhookURL;
    this.webhookRawQuery = encodeGoQuery(customQuery);
    this.headers = headers;
    this.extraData = extraData;
  }
}

/** DefaultConfig creates a Config with defaults applied and its PropKeyResolver. */
export function defaultConfig(): { config: Config; pkr: PropKeyResolver } {
  const config = new Config();
  const pkr = new PropKeyResolver(config as never, configSchema);
  pkr.setDefaultProps();
  return { config, pkr };
}

/** ConfigFromWebhookURL creates a new Config from a parsed (raw) webhook URL string. */
export function configFromWebhookURL(rawWebhookURL: string): {
  config: Config;
  pkr: PropKeyResolver;
} {
  const { config, pkr } = defaultConfig();
  const { scheme, url } = parseURLPreservingPath(rawWebhookURL);
  config.webhookURL = url;
  config.webhookRawQuery = url.search.slice(1);
  config.disableTLS = scheme === "http";
  return { config, pkr };
}
