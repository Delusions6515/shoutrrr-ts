import {
  EnumlessConfig,
  JsonClient,
  PropKeyResolver,
  type FieldSchema,
  type Logger,
  type Params,
  type Service,
  type ServiceSendOptions,
} from "@shoutrrr-ts/core-internal";

const fields: FieldSchema[] = [
  { name: "title", key: ["title"], default: "" },
  { name: "scheme", key: ["scheme"], default: "https" },
  { name: "sound", key: ["sound"], default: "" },
  { name: "badge", key: ["badge"], type: "int", default: "0" },
  { name: "icon", key: ["icon"], default: "" },
  { name: "group", key: ["group"], default: "" },
  { name: "url", key: ["url"], default: "" },
  { name: "category", key: ["category"], default: "" },
  { name: "copy", key: ["copy"], default: "" },
];

class BarkConfig extends EnumlessConfig {
  title = "";
  scheme = "https";
  sound = "";
  badge = 0;
  icon = "";
  group = "";
  url = "";
  category = "";
  copy = "";
  host = "";
  path = "";
  deviceKey = "";

  getURL(): URL {
    const result = new URL(`bark://:placeholder@${this.host || "invalid.example.test"}${this.path}`);
    result.password = this.deviceKey;
    result.search = new PropKeyResolver(this, fields).buildQuery();
    return result;
  }

  setURL(value: URL): void {
    this.deviceKey = decodeURIComponent(value.password);
    this.host = value.host;
    this.path = decodeURIComponent(value.pathname);
    const resolver = new PropKeyResolver(this, fields);
    // Go's url.Query iterates keys, and uses the first value of each key.
    for (const [key, vals] of [...new Set(value.searchParams.keys())].map((key) => [key, value.searchParams.getAll(key)] as const)) {
      resolver.set(key, vals[0] ?? "");
    }
  }

  apiURL(): string {
    const path = this.path.startsWith("/") ? this.path : `/${this.path}`;
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const result = new URL(`${this.scheme}://${this.host}`);
    result.pathname = `${prefix}push`;
    return result.href;
  }
}

/** Bark push adapter; credentials remain internal and public errors are normalized by the router. */
export class BarkService implements Service {
  private readonly config = new BarkConfig();
  private readonly resolver = new PropKeyResolver(this.config, fields);

  setLogger(_logger: Logger): void {}

  initialize(value: URL, _logger?: Logger): void {
    this.resolver.setDefaultProps();
    this.config.setURL(value);
  }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    // Go applies send params to the stored config, not a copy.
    this.resolver.updateConfigFromParams(params);
    const config = this.config;
    const payload: Record<string, string | number> = {
      body: message,
      device_key: config.deviceKey,
      title: config.title,
      badge: config.badge,
    };
    for (const [key, value] of Object.entries({
      sound: config.sound, icon: config.icon, group: config.group,
      url: config.url, category: config.category, copy: config.copy,
    })) {
      if (value !== "") payload[key] = value;
    }
    const response = await new JsonClient().request("POST", config.apiURL(), {
      body: JSON.stringify(payload), contentType: "application/json", signal: options?.signal,
    });
    const body: unknown = await response.json();
    if (response.status < 200 || response.status >= 300 ||
        typeof body !== "object" || body === null ||
        (body as { code?: unknown }).code !== 200) {
      throw new Error("Bark delivery was rejected");
    }
  }
}

/** Register Bark only after its Go parity, failure, redaction, and package gates pass. */
export const descriptor = {
  schemes: ["bark"] as const,
  factory: (): BarkService => new BarkService(),
};
