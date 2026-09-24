import { JsonClient, type Logger, type Params, type Service, type ServiceSendOptions } from "@shoutrrr-ts/core-internal";

const tokenPattern = /(?:(xox.|hook)[-:]|:?)([A-Z0-9]{9,})([-/,])([A-Z0-9]{9,})([-/,])([A-Za-z0-9]{24,})/;
const keys: Record<string, string> = {
  botname: "botname", username: "botname", icon: "icon", icon_emoji: "icon", icon_url: "icon",
  color: "color", title: "title", thread_ts: "thread_ts",
};

function tokenFrom(value: string): string {
  const match = tokenPattern.exec(value);
  if (!match || match[3] !== match[5]) throw new Error("invalid Slack token");
  return `${match[1] || "hook"}:${match[2]}-${match[4]}-${match[6]}`;
}

function authority(raw: string | undefined, url: URL): string {
  return raw?.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1]?.split("@").at(-1)?.split(":")[0] ?? url.hostname;
}

/** Slack incoming-webhook and chat.postMessage adapter for the pinned Go revision. */
export class SlackService implements Service {
  private token = "";
  private channel = "";
  private fields: Record<string, string> = {};

  setLogger(_logger: Logger): void {}

  initialize(url: URL, _logger?: Logger, rawURL?: string): void {
    const host = authority(rawURL, url);
    this.fields = {};
    if (url.pathname.length > 1) {
      this.token = tokenFrom(`${host}${decodeURIComponent(url.pathname)}`);
      this.channel = "webhook";
      this.fields.botname = decodeURIComponent(url.username);
    } else {
      this.token = tokenFrom(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`);
      this.channel = host;
    }
    for (const key of new Set(url.searchParams.keys())) {
      this.setField(this.fields, key, url.searchParams.get(key) ?? "");
    }
  }

  private setField(fields: Record<string, string>, key: string, value: string): void {
    const name = keys[key.toLowerCase()];
    if (!name) throw new Error("invalid Slack option");
    fields[name] = value;
  }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    // Go updates the stored config, so successful send-time options persist.
    for (const [key, value] of Object.entries(params ?? {})) this.setField(this.fields, key, value);
    const fields = this.fields;
    const attachments: Array<{ text: string; color?: string }> = [];
    for (const [index, line] of message.split("\n").entries()) {
      if (index >= 100) attachments[99]!.text += `\n${line}`;
      else attachments.push({ text: line, ...(fields.color ? { color: fields.color } : {}) });
    }
    if (attachments.at(-1)?.text === "") attachments.pop();
    const payload: Record<string, unknown> = { text: fields.title ?? "" };
    if (fields.botname) payload.username = fields.botname;
    if (attachments.length) payload.attachments = attachments;
    if (fields.thread_ts) payload.thread_ts = fields.thread_ts;
    if (this.channel !== "webhook") payload.channel = this.channel;
    if (fields.icon) {
      payload[/https?:\/\//.test(fields.icon) ? "icon_url" : "icon_emoji"] = fields.icon;
    }
    const api = !this.token.startsWith("hook:");
    const endpoint = api ? "https://slack.com/api/chat.postMessage" :
      `https://hooks.slack.com/services/${this.token.slice(5).replaceAll("-", "/")}`;
    const response = await new JsonClient().request("POST", endpoint, {
      contentType: "application/json", body: JSON.stringify(payload),
      ...(api ? { headers: { Authorization: `Bearer ${this.token.slice(0, 4)}-${this.token.slice(5)}` } } : {}),
      signal: options?.signal,
    });
    const text = await response.text();
    if (api) {
      if (response.status >= 400) throw new Error("Slack API HTTP rejection");
      let result: unknown;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error("Slack API response was not valid JSON");
      }
      if (typeof result !== "object" || result === null || (result as { ok?: boolean }).ok !== true) {
        throw new Error("Slack API response rejected");
      }
    } else if (text !== "ok" && (text !== "" || response.status !== 200)) {
      throw new Error("Slack webhook response rejected");
    }
  }
}

export const descriptor = { schemes: ["slack"] as const, factory: (): SlackService => new SlackService() };
