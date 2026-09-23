import { JsonClient, goQueryEscape, type Logger, type Params, type Service, type ServiceSendOptions } from "@shoutrrr-ts/core-internal";

/** Zulip stream-message adapter with per-send stream/topic overrides. */
export class ZulipService implements Service {
  private mail = "";
  private key = "";
  private host = "";
  private stream = "";
  private topic = "";

  setLogger(_logger: Logger): void {}

  initialize(url: URL, _logger?: Logger, rawURL?: string): void {
    this.mail = decodeURIComponent(url.username);
    this.key = decodeURIComponent(url.password);
    this.host = url.host;
    this.stream = url.searchParams.get("stream") ?? "";
    this.topic = url.searchParams.get("topic") ?? "";
    const authority = rawURL?.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1] ?? "";
    const userInfo = authority.includes("@") ? authority.slice(0, authority.lastIndexOf("@")) : "";
    if (!this.mail || !userInfo.includes(":") || !this.host) throw new Error("invalid Zulip configuration");
  }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    const stream = params?.stream ?? this.stream;
    const topic = params?.topic ?? this.topic;
    if ([...topic].length > 60) throw new Error("Zulip topic exceeds 60 characters");
    if (Buffer.byteLength(message) > 10000) throw new Error("Zulip message exceeds 10000 bytes");
    const values: Record<string, string> = { content: message, to: stream, type: "stream" };
    if (topic) values.topic = topic;
    const body = Object.keys(values).sort().map((key) => `${goQueryEscape(key)}=${goQueryEscape(values[key] ?? "")}`).join("&");
    // Fetch forbids credentials in URLs; Go's HTTP client turns the userinfo into Basic auth.
    const authorization = `Basic ${Buffer.from(`${this.mail}:${this.key}`).toString("base64")}`;
    const response = await new JsonClient().request("POST", `https://${this.host}/api/v1/messages`, {
      contentType: "application/x-www-form-urlencoded", headers: { Authorization: authorization }, body,
      signal: options?.signal,
    });
    if (response.status !== 200) throw new Error("Zulip delivery was rejected");
    await response.arrayBuffer();
  }
}

export const descriptor = {
  schemes: ["zulip"] as const,
  factory: (): ZulipService => new ZulipService(),
};
