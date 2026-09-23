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
  { name: "priority", key: ["priority"], type: "int", default: "0" },
  { name: "title", key: ["title"], default: "Shoutrrr notification" },
  { name: "disableTLS", key: ["disabletls"], type: "bool", default: "No" },
];

class GotifyConfig extends EnumlessConfig {
  token = "";
  host = "";
  path = "";
  priority = 0;
  title = "Shoutrrr notification";
  disableTLS = false;

  setURL(value: URL): void {
    const path = decodeURIComponent(value.pathname).replace(/\/$/, "");
    const index = path.lastIndexOf("/") + 1;
    this.path = path.slice(0, index);
    if (this.path === "/") this.path = "";
    this.token = path.slice(index);
    this.host = value.host;
    const resolver = new PropKeyResolver(this, fields);
    for (const key of new Set(value.searchParams.keys())) {
      resolver.set(key, value.searchParams.get(key) ?? "");
    }
  }

  getURL(): URL {
    const value = new URL(`gotify://${this.host || "invalid.example.test"}/${this.path}${this.token}`);
    value.search = new PropKeyResolver(this, fields).buildQuery();
    return value;
  }

  apiURL(): string {
    if (!/^A[a-zA-Z0-9._-]{14}$/.test(this.token)) {
      throw new Error("invalid Gotify token");
    }
    const scheme = this.disableTLS ? "http" : "https";
    // Go concatenates the parsed subpath and `/message` without cleaning slashes.
    return `${scheme}://${this.host}${this.path}/message?token=${this.token}`;
  }
}

/** Gotify adapter for the configured app token and message endpoint. */
export class GotifyService implements Service {
  private readonly config = new GotifyConfig();
  private readonly resolver = new PropKeyResolver(this.config, fields);

  setLogger(_logger: Logger): void {}

  initialize(url: URL, _logger?: Logger): void {
    this.config.setURL(url);
  }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    // Go logs invalid overrides and still sends using the last valid configuration.
    try { this.resolver.updateConfigFromParams(params); } catch { /* public diagnostics must not include tokens */ }
    const config = this.config;
    const endpoint = config.apiURL();
    await new JsonClient().request("POST", endpoint, {
      contentType: "application/json",
      body: JSON.stringify({ message, title: config.title, priority: config.priority }),
      signal: options?.signal,
    }).then(async (response) => {
      const data: unknown = await response.json();
      if (response.status < 200 || response.status >= 300 || typeof data !== "object" || data === null) {
        throw new Error("Gotify delivery was rejected");
      }
    });
  }
}

export const descriptor = {
  schemes: ["gotify"] as const,
  factory: (): GotifyService => new GotifyService(),
};
