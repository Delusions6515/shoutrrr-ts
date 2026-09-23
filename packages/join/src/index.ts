import {
  EnumlessConfig, JsonClient, PropKeyResolver, goQueryEscape,
  type FieldSchema, type Logger, type Params, type Service, type ServiceSendOptions,
} from "@shoutrrr-ts/core-internal";

const fields: FieldSchema[] = [
  { name: "devices", key: ["devices"], type: "string[]" },
  { name: "title", key: ["title"] },
  { name: "icon", key: ["icon"] },
];
const endpoint = "https://joinjoaomgcd.appspot.com/_ah/api/messaging/v1/sendPush";

class JoinConfig extends EnumlessConfig {
  apiKey = "";
  devices: string[] = [];
  title = "";
  icon = "";

  getURL(): URL {
    const value = new URL("join://Token:placeholder@join");
    value.password = this.apiKey;
    value.search = new PropKeyResolver(this, fields).buildQuery();
    return value;
  }

  setURL(value: URL): void {
    this.apiKey = decodeURIComponent(value.password);
    const resolver = new PropKeyResolver(this, fields);
    for (const key of new Set(value.searchParams.keys())) {
      resolver.set(key, value.searchParams.get(key) ?? "");
    }
    if (this.devices.length < 1 || !this.apiKey) throw new Error("missing Join configuration");
  }
}

/** Join sends a query-only POST with an empty body. */
export class JoinService implements Service {
  private readonly config = new JoinConfig();

  setLogger(_logger: Logger): void {}
  initialize(value: URL, _logger?: Logger): void { this.config.setURL(value); }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    const config = this.config;
    const values: Record<string, string> = {
      apikey: config.apiKey, deviceIds: config.devices.join(","), text: message,
    };
    const title = params?.title ?? config.title;
    const icon = params?.icon ?? config.icon;
    if (title) values.title = title;
    if (icon) values.icon = icon;
    const query = Object.keys(values).sort().map((key) => `${goQueryEscape(key)}=${goQueryEscape(values[key] ?? "")}`).join("&");
    const response = await new JsonClient().request("POST", `${endpoint}?${query}`, {
      contentType: "text/plain", signal: options?.signal,
    });
    if (response.status !== 200) throw new Error("Join delivery was rejected");
    await response.arrayBuffer();
  }
}

export const descriptor = {
  schemes: ["join"] as const,
  factory: (): JoinService => new JoinService(),
};
