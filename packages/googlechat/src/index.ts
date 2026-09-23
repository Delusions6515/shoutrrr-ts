import { JsonClient, goQueryEscape, type Logger, type Params, type Service, type ServiceSendOptions } from "@shoutrrr-ts/core-internal";

/** Google Chat incoming-webhook adapter, including Go's `hangouts` alias. */
export class GoogleChatService implements Service {
  private host = "";
  private path = "";
  private key = "";
  private token = "";

  setLogger(_logger: Logger): void {}

  initialize(value: URL, _logger?: Logger): void {
    this.host = value.host;
    this.path = decodeURIComponent(value.pathname);
    this.key = value.searchParams.get("key") ?? "";
    this.token = value.searchParams.get("token") ?? "";
    // Go ccf8139 checks key twice; an absent token is accepted by the router.
    if (!this.key) throw new Error("missing Google Chat key");
  }

  async send(message: string, _params?: Params, options?: ServiceSendOptions): Promise<void> {
    const endpoint = new URL(`https://${this.host}`);
    endpoint.pathname = this.path;
    endpoint.search = `key=${goQueryEscape(this.key)}&token=${goQueryEscape(this.token)}`;
    const response = await new JsonClient().request("POST", endpoint.href, {
      contentType: "application/json", body: JSON.stringify({ text: message }), signal: options?.signal,
    });
    if (response.status < 200 || response.status >= 300) throw new Error("Google Chat delivery was rejected");
    await response.arrayBuffer();
  }
}

export const descriptor = {
  schemes: ["googlechat", "hangouts"] as const,
  factory: (): GoogleChatService => new GoogleChatService(),
};
