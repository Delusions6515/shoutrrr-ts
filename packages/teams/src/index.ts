import {
  EnumlessConfig, JsonClient, PropKeyResolver,
  type FieldSchema, type Logger, type Params, type Service, type ServiceSendOptions,
} from "@shoutrrr-ts/core-internal";

const legacyHost = "outlook.office.com";
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/;
const hash = /[A-Za-z0-9]{32}/;
const fields: FieldSchema[] = [
  { name: "title", key: ["title"] },
  { name: "color", key: ["color"] },
  { name: "host", key: ["host"], default: legacyHost },
];

class TeamsConfig extends EnumlessConfig {
  group = "";
  tenant = "";
  altID = "";
  groupOwner = "";
  title = "";
  color = "";
  host = legacyHost;

  getURL(): URL {
    const value = new URL(`teams://${this.group}@${this.tenant}/${this.altID}/${this.groupOwner}`);
    value.search = new PropKeyResolver(this, fields).buildQuery();
    return value;
  }

  setURL(value: URL): void {
    let parts: string[];
    if (value.password) {
      const legacy = decodeURIComponent(value.username).split("@");
      if (legacy.length !== 2) throw new Error("invalid Teams URL format");
      parts = [legacy[0] ?? "", legacy[1] ?? "", decodeURIComponent(value.password), value.hostname];
    } else {
      const path = decodeURIComponent(value.pathname).split("/").filter(Boolean);
      parts = [decodeURIComponent(value.username), value.hostname, path[0] ?? "", path[1] ?? ""];
    }
    if (!uuid.test(parts[0] ?? "") || !uuid.test(parts[1] ?? "") ||
        !hash.test(parts[2] ?? "") || !uuid.test(parts[3] ?? "")) {
      throw new Error("invalid Teams webhook parts");
    }
    [this.group, this.tenant, this.altID, this.groupOwner] = parts as [string, string, string, string];
    const resolver = new PropKeyResolver(this, fields);
    for (const key of new Set(value.searchParams.keys())) {
      resolver.set(key, value.searchParams.get(key) ?? "");
    }
  }
}

/** Teams incoming webhook adapter including Go's custom URL conversion. */
export class TeamsService implements Service {
  private readonly config = new TeamsConfig();
  private readonly resolver = new PropKeyResolver(this.config, fields);

  setLogger(_logger: Logger): void {}

  initialize(value: URL, _logger?: Logger): void {
    if (value.protocol === "teams+https:") {
      const match = value.href.match(/([0-9a-f-]{36})@([0-9a-f-]{36})\/[^/]+\/([0-9a-f]{32})\/([0-9a-f-]{36})/);
      if (!match) throw new Error("invalid Teams custom webhook URL");
      const converted = new URL(`teams://${match[1]}@${match[2]}/${match[3]}/${match[4]}`);
      converted.search = value.search;
      converted.searchParams.set("host", value.host);
      this.config.setURL(converted);
    } else {
      this.config.setURL(value);
    }
  }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    // Go logs a failed override and still sends with the valid config.
    try { this.resolver.updateConfigFromParams(params); } catch { /* no privileged diagnostics */ }
    const config = this.config;
    const sections = message.split("\n").map((line) => ({
      ...(line ? { text: line } : {}), startGroup: false,
    }));
    const first = message.split("\n")[0] ?? "";
    const summary = config.title || (Buffer.byteLength(first) > 20
      ? Buffer.from(first).subarray(0, 21).toString() : first);
    const payload: Record<string, unknown> = {
      "@type": "MessageCard", "@context": "http://schema.org/extensions",
      markdown: true,
    };
    if (config.title) payload.title = config.title;
    if (summary) payload.summary = summary;
    payload.sections = sections;
    if (config.color) payload.themeColor = config.color;
    const host = config.host || legacyHost;
    const initial = host === legacyHost ? "webhook" : "webhookb2";
    const endpoint = `https://${host}/${initial}/${config.group}@${config.tenant}/IncomingWebhook/${config.altID}/${config.groupOwner}`;
    const response = await new JsonClient().request("POST", endpoint, {
      contentType: "application/json", body: JSON.stringify(payload), signal: options?.signal,
    });
    if (response.status !== 200) throw new Error("Teams delivery was rejected");
    await response.arrayBuffer();
  }
}

export const descriptor = {
  schemes: ["teams"] as const,
  factory: (): TeamsService => new TeamsService(),
};
