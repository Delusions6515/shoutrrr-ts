import {
  EnumlessConfig, JsonClient, PropKeyResolver, createEnumFormatter,
  type EnumFormatter, type FieldSchema, type Logger, type Params, type Service, type ServiceSendOptions,
} from "@shoutrrr-ts/core-internal";

const modes = createEnumFormatter(["None", "Markdown", "HTML", "MarkdownV2"]);
const fields: FieldSchema[] = [
  { name: "preview", key: ["preview"], type: "bool", default: "Yes" },
  { name: "notification", key: ["notification"], type: "bool", default: "Yes" },
  { name: "parseMode", key: ["parsemode"], type: "enum", enumName: "ParseMode", default: "None" },
  { name: "chats", key: ["chats", "channels"], type: "string[]" },
  { name: "title", key: ["title"] },
];

class TelegramConfig extends EnumlessConfig {
  token = "";
  preview = true;
  notification = true;
  parseMode = 0;
  chats: string[] = [];
  title = "";
  override enums(): Record<string, EnumFormatter> { return { ParseMode: modes }; }
  getURL(): URL {
    let url: URL;
    try { url = new URL("telegram://telegram"); }
    catch { throw new Error("invalid Telegram configuration"); }
    const [id, secret] = this.token.split(":");
    url.username = id ?? "";
    url.password = secret ?? "";
    url.search = new PropKeyResolver(this, fields).buildQuery();
    return url;
  }
  setURL(url: URL): void {
    const token = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
    if (!/^[0-9]+:[a-zA-Z0-9_-]+$/.test(token)) throw new Error("invalid Telegram token");
    const resolver = new PropKeyResolver(this, fields);
    resolver.setDefaultProps();
    for (const key of new Set(url.searchParams.keys())) resolver.set(key, url.searchParams.get(key) ?? "");
    if (this.chats.length < 1) throw new Error("no Telegram chats configured");
    this.token = token;
  }
}

function escapeHTML(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&#34;").replace(/'/g, "&#39;");
}

/** Telegram sendMessage adapter for the pinned Go client, including its HTTP-200 ok:false behavior. */
export class TelegramService implements Service {
  private readonly config = new TelegramConfig();
  setLogger(_logger: Logger): void {}
  initialize(url: URL): void { this.config.setURL(url); }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    if (Buffer.byteLength(message) > 4096) throw new Error("Telegram message exceeds the max length");
    const config = Object.assign(new TelegramConfig(), this.config);
    new PropKeyResolver(config, fields).updateConfigFromParams(params);
    // Go iterates the original chat list even if send parameters override chats.
    for (const chat of this.config.chats) {
      const [id, thread] = chat.split(":", 2);
      const threadID = thread && /^[+-]?\d+$/.test(thread) && Number.isSafeInteger(Number(thread)) ? Number(thread) : undefined;
      const mode = config.parseMode || (config.title ? 2 : 0);
      const text = mode === 2
        ? `<b>${escapeHTML(config.title)}</b>\n${config.parseMode === 0 ? escapeHTML(message) : message}`
        : message;
      const payload = {
        text, chat_id: id ?? "",
        ...(threadID !== undefined ? { message_thread_id: threadID } : {}),
        ...(mode ? { parse_mode: modes.print(mode) } : {}),
        disable_web_page_preview: !config.preview,
        disable_notification: !config.notification,
        reply_to_message_id: 0,
      };
      const response = await new JsonClient().request("POST", `https://api.telegram.org/bot${config.token}/sendMessage`, {
        contentType: "application/json", body: JSON.stringify(payload), signal: options?.signal,
      });
      // A 200 with ok:false returns a nil error in pinned Go. Do not infer delivery from it.
      if (response.status >= 300) throw new Error("Telegram delivery rejected");
      try { await response.json(); } catch { throw new Error("Telegram returned invalid JSON"); }
    }
  }
}

export const descriptor = { schemes: ["telegram"] as const, factory: (): TelegramService => new TelegramService() };
