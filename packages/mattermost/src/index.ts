import {
  EnumlessConfig, JsonClient, PropKeyResolver,
  type FieldSchema, type Logger, type Params, type Service, type ServiceSendOptions,
} from "@shoutrrr-ts/core-internal";

const fields: FieldSchema[] = [
  { name: "icon", key: ["icon", "icon_emoji", "icon_url"], default: "" },
  { name: "title", key: ["title"], default: "" },
];

class MattermostConfig extends EnumlessConfig {
  host = "";
  token = "";
  username = "";
  channel = "";
  icon = "";
  title = "";

  getURL(): URL {
    const value = new URL(`mattermost://${this.host || "invalid.example.test"}/${this.token}`);
    value.username = this.username;
    if (this.channel) value.pathname += `/${this.channel}`;
    value.search = new PropKeyResolver(this, fields).buildQuery();
    return value;
  }

  setURL(url: URL): void {
    const path = decodeURIComponent(url.pathname);
    if (path === "" || path === "/") throw new Error("missing Mattermost token");
    this.host = url.host;
    this.username = decodeURIComponent(url.username);
    const parts = path.slice(1).split("/");
    this.token = parts[0] ?? "";
    this.channel = parts[1] ?? "";
    const resolver = new PropKeyResolver(this, fields);
    for (const key of new Set(url.searchParams.keys())) {
      resolver.set(key, url.searchParams.get(key) ?? "");
    }
  }
}

/** Mattermost incoming-webhook adapter. */
export class MattermostService implements Service {
  private readonly config = new MattermostConfig();
  private readonly resolver = new PropKeyResolver(this.config, fields);

  setLogger(_logger: Logger): void {}

  initialize(url: URL, _logger?: Logger): void { this.config.setURL(url); }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    // Go constructs the endpoint before updating params, then rejects unknown keys.
    const endpoint = `https://${this.config.host}/hooks/${this.config.token}`;
    this.resolver.updateConfigFromParams(params);
    const payload: Record<string, string> = { text: message };
    if (this.config.username) payload.username = this.config.username;
    if (this.config.channel) payload.channel = this.config.channel;
    if (this.config.icon) payload[/https?:\/\//.test(this.config.icon) ? "icon_url" : "icon_emoji"] = this.config.icon;
    const response = await new JsonClient().request("POST", endpoint, {
      contentType: "application/json", body: JSON.stringify(payload), signal: options?.signal,
    });
    if (response.status !== 200) throw new Error("Mattermost delivery was rejected");
    await response.arrayBuffer();
  }
}

export const descriptor = {
  schemes: ["mattermost"] as const,
  factory: (): MattermostService => new MattermostService(),
};
