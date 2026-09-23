import {
  EnumlessConfig, JsonClient, PropKeyResolver,
  type FieldSchema, type Logger, type Params, type Service, type ServiceSendOptions,
} from "@shoutrrr-ts/core-internal";

const fields: FieldSchema[] = [
  { name: "events", key: ["events"], type: "string[]" },
  { name: "value1", key: ["value1"] },
  { name: "value2", key: ["value2"] },
  { name: "value3", key: ["value3"] },
  { name: "messageValue", key: ["messagevalue"], type: "uint", bits: 8, default: "2" },
  { name: "titleValue", key: ["titlevalue"], type: "uint", bits: 8, default: "0" },
  { name: "title", key: ["title"], default: "" },
];

class IFTTTConfig extends EnumlessConfig {
  key = "";
  events: string[] = [];
  value1 = ""; value2 = ""; value3 = "";
  messageValue = 2; titleValue = 0; title = "";

  getURL(): URL {
    const value = new URL(`ifttt://${this.key || "invalid.example.test"}/`);
    value.search = new PropKeyResolver(this, fields).buildQuery();
    return value;
  }

  setURL(value: URL, rawURL?: string): void {
    if (this.messageValue === 0) this.messageValue = 2;
    const authority = rawURL?.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1];
    this.key = authority ? authority.slice(authority.lastIndexOf("@") + 1).split(":")[0] ?? "" : value.hostname;
    const resolver = new PropKeyResolver(this, fields);
    for (const key of new Set(value.searchParams.keys())) {
      resolver.set(key, value.searchParams.get(key) ?? "");
    }
    if (this.messageValue < 1 || this.messageValue > 3 || this.titleValue > 3 ||
        this.titleValue === this.messageValue || this.events.length === 0 || !this.key) {
      throw new Error("invalid IFTTT configuration");
    }
  }
}

/** IFTTT Maker webhook sender. Unlike pinned Go, it never prints payloads to stdout. */
export class IFTTTService implements Service {
  private readonly config = new IFTTTConfig();
  private readonly resolver = new PropKeyResolver(this.config, fields);

  setLogger(_logger: Logger): void {}
  initialize(value: URL, _logger?: Logger, rawURL?: string): void { this.config.setURL(value, rawURL); }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    this.resolver.updateConfigFromParams(params);
    const config = this.config;
    const payload: Record<string, string> = {
      value1: params?.value1 ?? config.value1,
      value2: params?.value2 ?? config.value2,
      value3: params?.value3 ?? config.value3,
    };
    if (config.messageValue >= 1 && config.messageValue <= 3) payload[`value${config.messageValue}`] = message;
    for (const event of config.events) {
      const endpoint = `https://maker.ifttt.com/trigger/${event}/with/key/${config.key}`;
      const response = await new JsonClient().request("POST", endpoint, {
        contentType: "application/json", body: JSON.stringify(payload), signal: options?.signal,
      });
      if (response.status < 200 || response.status >= 300) throw new Error("IFTTT delivery was rejected");
      await response.arrayBuffer();
    }
  }
}

export const descriptor = {
  schemes: ["ifttt"] as const,
  factory: (): IFTTTService => new IFTTTService(),
};
