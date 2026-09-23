import { JsonClient, type Logger, type Params, type Service, type ServiceSendOptions } from "@shoutrrr-ts/core-internal";

/** Rocket.Chat webhook adapter; the endpoint tokens never enter public errors. */
export class RocketChatService implements Service {
  private host = "";
  private tokenA = "";
  private tokenB = "";
  private username = "";
  private channel = "";

  setLogger(_logger: Logger): void {}

  initialize(url: URL, _logger?: Logger): void {
    const parts = decodeURIComponent(url.pathname).split("/");
    if (parts.length < 3) throw new Error("not enough webhook arguments");
    this.host = url.host;
    this.tokenA = parts[1] ?? "";
    this.tokenB = parts[2] ?? "";
    this.username = decodeURIComponent(url.username);
    if (parts.length > 3) {
      const part = parts[3] ?? "";
      this.channel = url.hash ? `#${decodeURIComponent(url.hash.slice(1))}` :
        part.startsWith("@") ? part : `#${part}`;
    }
  }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    const body: Record<string, string> = { text: message };
    const username = params?.username ?? this.username;
    const channel = params?.channel ?? this.channel;
    if (username) body.username = username;
    if (channel) body.channel = channel;
    const response = await new JsonClient().request("POST", `https://${this.host}/hooks/${this.tokenA}/${this.tokenB}`, {
      contentType: "application/json", body: JSON.stringify(body), signal: options?.signal,
    });
    if (response.status !== 200) throw new Error("Rocket.Chat delivery was rejected");
    await response.arrayBuffer();
  }
}

export const descriptor = {
  schemes: ["rocketchat"] as const,
  factory: (): RocketChatService => new RocketChatService(),
};
