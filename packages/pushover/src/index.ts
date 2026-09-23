import {
  EnumlessConfig, JsonClient, PropKeyResolver, goQueryEscape,
  type FieldSchema, type Logger, type Params, type Service, type ServiceSendOptions,
} from "@shoutrrr-ts/core-internal";

const fields: FieldSchema[] = [
  { name: "devices", key: ["devices"], type: "string[]" },
  { name: "priority", key: ["priority"], type: "int", bits: 8, default: "0" },
  { name: "title", key: ["title"] },
];
const endpoint = "https://api.pushover.net/1/messages.json";

class PushoverConfig extends EnumlessConfig {
  token = "";
  user = "";
  devices: string[] = [];
  priority = 0;
  title = "";

  getURL(): URL {
    const value = new URL(`pushover://Token:placeholder@${this.user || "invalid.example.test"}`);
    value.password = this.token;
    value.search = new PropKeyResolver(this, fields).buildQuery();
    return value;
  }

  setURL(value: URL): void {
    this.token = decodeURIComponent(value.password);
    this.user = value.host;
    const resolver = new PropKeyResolver(this, fields);
    for (const key of new Set(value.searchParams.keys())) {
      resolver.set(key, value.searchParams.get(key) ?? "");
    }
    if (!this.user || !this.token) throw new Error("missing Pushover configuration");
  }
}

/** Pushover device notification using Go-style form encoding. */
export class PushoverService implements Service {
  private readonly config = new PushoverConfig();
  private readonly resolver = new PropKeyResolver(this.config, fields);

  setLogger(_logger: Logger): void {}
  initialize(value: URL, _logger?: Logger): void { this.config.setURL(value); }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    this.resolver.updateConfigFromParams(params);
    const config = this.config;
    const values: Record<string, string> = {
      device: config.devices.join(","), user: config.user, token: config.token, message,
    };
    if (config.title) values.title = config.title;
    if (config.priority >= -2 && config.priority <= 1) values.priority = String(config.priority);
    const form = Object.keys(values).sort().map((key) => `${goQueryEscape(key)}=${goQueryEscape(values[key] ?? "")}`).join("&");
    const response = await new JsonClient().request("POST", endpoint, {
      contentType: "application/x-www-form-urlencoded", body: form, signal: options?.signal,
    });
    if (response.status !== 200) throw new Error("Pushover delivery was rejected");
    await response.arrayBuffer();
  }
}

export const descriptor = {
  schemes: ["pushover"] as const,
  factory: (): PushoverService => new PushoverService(),
};
