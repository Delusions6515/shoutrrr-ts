import {
  EnumlessConfig, JsonClient, PropKeyResolver, goQueryEscape,
  type FieldSchema, type Logger, type Params, type Service, type ServiceSendOptions,
} from "@shoutrrr-ts/core-internal";

const fields: FieldSchema[] = [
  { name: "title", key: ["title"] },
  { name: "username", key: ["username"] },
  { name: "avatar", key: ["avatar", "avatarurl"] },
  { name: "color", key: ["color"], type: "uint", base: 16, default: "0x50D9ff" },
  { name: "colorError", key: ["colorError"], type: "uint", base: 16, default: "0xd60510" },
  { name: "colorWarn", key: ["colorWarn"], type: "uint", base: 16, default: "0xffc441" },
  { name: "colorInfo", key: ["colorInfo"], type: "uint", base: 16, default: "0x2488ff" },
  { name: "colorDebug", key: ["colorDebug"], type: "uint", base: 16, default: "0x7b00ab" },
  { name: "splitLines", key: ["splitLines"], type: "bool", default: "Yes" },
  { name: "json", key: ["json"], type: "bool", default: "No" },
  { name: "threadID", key: ["thread_id"] },
];

class DiscordConfig extends EnumlessConfig {
  webhookID = "";
  token = "";
  title = "";
  username = "";
  avatar = "";
  color = 0;
  colorError = 0;
  colorWarn = 0;
  colorInfo = 0;
  colorDebug = 0;
  splitLines = true;
  json = false;
  threadID = "";

  getURL(): URL {
    try {
      const url = new URL(`discord://${this.token}@${this.webhookID}${this.json ? "/raw" : ""}`);
      url.search = new PropKeyResolver(this, fields).buildQuery();
      return url;
    } catch {
      throw new Error("invalid Discord configuration");
    }
  }

  setURL(url: URL, rawURL?: string): void {
    const resolver = new PropKeyResolver(this, fields);
    resolver.setDefaultProps();
    const rawHost = rawURL?.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1];
    this.webhookID = rawHost?.slice(rawHost.lastIndexOf("@") + 1) ?? url.host;
    this.token = decodeURIComponent(url.username);
    if (url.pathname) {
      if (url.pathname !== "/raw") throw new Error("invalid Discord URL path");
      this.json = true;
    }
    if (!this.webhookID || !this.token) throw new Error("missing Discord webhook ID or token");
    for (const key of new Set(url.searchParams.keys())) {
      resolver.set(key, url.searchParams.get(key) ?? "");
    }
  }
}

// Go reuses the first batch's backing slice when starting later line batches.
// Preserve that observable behavior, including later lines replacing earlier slots.
function lineBatches(message: string): string[][] {
  const slots: string[] = [];
  const lengths: number[] = [];
  let count = 0;
  let totalLength = 0;
  for (const line of message.split("\n")) {
    if (count === 10 || totalLength + 2000 > 6000) {
      lengths.push(count);
      count = 0;
    }
    const runes = Array.from(line);
    const text = runes.length > 2000 ? `${runes.slice(0, 1994).join("")} [...]` : line;
    const used = runes.length > 2000 ? 1994 : runes.length;
    if (used === 0) continue;
    slots[count++] = text;
    totalLength += used;
  }
  if (count > 0) lengths.push(count);
  return lengths.map((length) => slots.slice(0, length));
}

function plainBatches(message: string): string[][] {
  const batches: string[][] = [];
  let remaining = message;
  do {
    const runes = Array.from(remaining);
    const maxTotal = Math.min(runes.length, 6000);
    const items: string[] = [];
    let offset = 0;
    if (remaining) {
      for (let i = 0; i < 9; i++) {
        let end = offset + 2000;
        let next = end;
        if (end >= maxTotal) {
          end = maxTotal;
          next = maxTotal;
        } else {
          for (let distance = 0; distance < 100; distance++) {
            if (runes[end - distance] === " " || runes[end - distance] === "\n") {
              end -= distance;
              next = end + 1;
              break;
            }
          }
        }
        items.push(runes.slice(offset, end).join(""));
        offset = next;
        if (offset >= maxTotal) break;
      }
    }
    batches.push(items);
    const omitted = runes.length - offset;
    if (omitted === 0) break;
    remaining = Buffer.from(remaining).subarray(Buffer.byteLength(remaining) - omitted).toString();
  } while (remaining);
  return batches;
}

/** Discord webhook adapter with Go's line, chunk, and raw-JSON send modes. */
export class DiscordService implements Service {
  private readonly config = new DiscordConfig();
  setLogger(_logger: Logger): void {}
  initialize(url: URL, _logger?: Logger, rawURL?: string): void { this.config.setURL(url, rawURL); }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    const config = Object.assign(new DiscordConfig(), this.config);
    if (config.json) {
      await this.post(message, config, options);
      return;
    }
    const batches = config.splitLines ? lineBatches(message) : plainBatches(message);
    let firstError: unknown;
    for (const batch of batches) {
      try {
        new PropKeyResolver(config, fields).updateConfigFromParams(params);
        if (batch.length === 0) throw new Error("empty Discord message");
        const embeds = batch.map((description, index) => ({
          ...(index === 0 && config.title ? { title: config.title } : {}),
          ...(description ? { description } : {}),
          ...(config.color ? { color: config.color } : {}),
        }));
        const payload = {
          embeds,
          ...(config.username ? { username: config.username } : {}),
          ...(config.avatar ? { avatar_url: config.avatar } : {}),
        };
        await this.post(JSON.stringify(payload), config, options);
      } catch (error) {
        if (firstError === undefined) firstError = error;
      }
    }
    if (firstError !== undefined) throw firstError;
  }

  private async post(body: string, config: DiscordConfig, options?: ServiceSendOptions): Promise<void> {
    const endpoint = `https://discord.com/api/webhooks/${config.webhookID}/${config.token}` +
      (config.threadID ? `?thread_id=${goQueryEscape(config.threadID)}` : "");
    const response = await new JsonClient().request("POST", endpoint, {
      contentType: "application/json", body, signal: options?.signal,
    });
    if (response.status !== 204) throw new Error("Discord webhook status rejected");
    await response.arrayBuffer();
  }
}

export const descriptor = { schemes: ["discord"] as const, factory: (): DiscordService => new DiscordService() };
