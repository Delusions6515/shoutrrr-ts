import {
  EnumlessConfig, JsonClient, PropKeyResolver,
  type FieldSchema, type Logger, type Params, type Service, type ServiceSendOptions,
} from "@shoutrrr-ts/core-internal";

const fields: FieldSchema[] = [{ name: "title", key: ["title"], default: "Shoutrrr notification" }];
const endpoint = "https://api.pushbullet.com/v2/pushes";

class PushbulletConfig extends EnumlessConfig {
  token = "";
  targets: string[] = [];
  // Go initializes this config without applying the tagged title default.
  title = "";

  getURL(): URL {
    const value = new URL(`pushbullet://${this.token || "invalid.example.test"}/${this.targets.join("/")}`);
    value.search = new PropKeyResolver(this, fields).buildQuery();
    return value;
  }

  setURL(value: URL, rawURL?: string): void {
    const rawAuthority = rawURL?.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1];
    // WHATWG URL.hostname lowercases the case-sensitive Pushbullet API token.
    this.token = rawAuthority ? rawAuthority.slice(rawAuthority.lastIndexOf("@") + 1).split(":")[0] ?? "" : value.hostname;
    if (this.token.length !== 34) throw new Error("invalid Pushbullet token length");
    let path = decodeURIComponent(value.pathname);
    if (path.startsWith("/")) path = path.slice(1);
    if (value.hash) path += `/#${decodeURIComponent(value.hash.slice(1))}`;
    this.targets = path.split("/");
    const resolver = new PropKeyResolver(this, fields);
    for (const key of new Set(value.searchParams.keys())) {
      resolver.set(key, value.searchParams.get(key) ?? "");
    }
  }
}

/** Pushbullet note sender; targets are dispatched in order and stop on the first error. */
export class PushbulletService implements Service {
  private readonly config = new PushbulletConfig();

  setLogger(_logger: Logger): void {}
  initialize(url: URL, _logger?: Logger, rawURL?: string): void { this.config.setURL(url, rawURL); }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    const config = Object.assign(new PushbulletConfig(), this.config);
    new PropKeyResolver(config, fields).updateConfigFromParams(params);
    for (const target of config.targets) {
      const body: Record<string, string> = {
        type: "note", title: config.title, body: message,
        email: "", channel_tag: "", device_iden: "",
      };
      if (/.*@.*\..*/.test(target)) body.email = target;
      else if (target.startsWith("#")) body.channel_tag = target.slice(1);
      else body.device_iden = target;
      const response = await new JsonClient().request("POST", endpoint, {
        contentType: "application/json",
        headers: { "Access-Token": config.token },
        body: JSON.stringify(body), signal: options?.signal,
      });
      const payload: unknown = await response.json();
      if (response.status < 200 || response.status >= 300 || typeof payload !== "object" || payload === null) {
        throw new Error("Pushbullet delivery was rejected");
      }
    }
  }
}

export const descriptor = {
  schemes: ["pushbullet"] as const,
  factory: (): PushbulletService => new PushbulletService(),
};
