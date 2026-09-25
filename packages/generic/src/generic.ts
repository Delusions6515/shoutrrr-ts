import { request as requestHTTP } from "node:http";
import { request as requestHTTPS } from "node:https";
import {
  JsonClient,
  getTransport,
  type Logger,
  type Params,
  PropKeyResolver,
  type Service,
  type ServiceSendOptions,
  Standard,
} from "@shoutrrr-ts/core-internal";
import {
  type Config,
  configFromWebhookURL,
  configSchema,
  defaultConfig,
  Scheme,
} from "./config.ts";
import { jsonPayload } from "./payload.ts";
import { Templater } from "./templater.ts";

/** Common key for the title param (port of Go `types.TitleKey`). */
const TitleKey = "title";
const MaximumRedirects = 10;
const SensitiveRedirectHeaders = new Set(["authorization", "cookie", "proxy-authorization"]);

interface NodeResponse {
  body: string;
  status: number;
}

/** Sends methods that Fetch forbids from carrying a body using Node's HTTP transport. */
function requestWithBody(
  method: string,
  rawURL: string,
  headers: Record<string, string>,
  body: string | undefined,
  signal: AbortSignal | undefined,
  redirectCount = 0,
  initialURL = new URL(rawURL),
): Promise<NodeResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(rawURL);
    const requestHeaders = { ...headers };
    if (
      body !== undefined &&
      !Object.keys(requestHeaders).some((key) => key.toLowerCase() === "content-length")
    ) {
      requestHeaders["Content-Length"] = String(Buffer.byteLength(body));
    }
    const request = (url.protocol === "https:" ? requestHTTPS : requestHTTP)(
      url,
      { method, headers: requestHeaders, signal },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (location && [301, 302, 303, 307, 308].includes(status)) {
          response.resume();
          if (redirectCount >= MaximumRedirects) {
            reject(new Error(`stopped after ${MaximumRedirects} redirects`));
            return;
          }
          const destination = new URL(location, url);
          const redirectedHeaders = { ...headers };
          if (!isSameOrSubdomain(destination.hostname, initialURL.hostname)) {
            for (const key of Object.keys(redirectedHeaders)) {
              if (SensitiveRedirectHeaders.has(key.toLowerCase())) {
                delete redirectedHeaders[key];
              }
            }
          }
          const preserveBody = status === 307 || status === 308;
          const redirectedMethod = preserveBody || method.toUpperCase() === "HEAD" ? method : "GET";
          resolve(requestWithBody(
            redirectedMethod,
            destination.href,
            redirectedHeaders,
            preserveBody ? body : undefined,
            signal,
            redirectCount + 1,
            initialURL,
          ));
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        });
        response.on("end", () => resolve({
          body: Buffer.concat(chunks).toString(),
          status,
        }));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function isSameOrSubdomain(candidate: string, original: string): boolean {
  const normalizedCandidate = candidate.toLowerCase();
  const normalizedOriginal = original.toLowerCase();
  return normalizedCandidate === normalizedOriginal || normalizedCandidate.endsWith(`.${normalizedOriginal}`);
}

/** Service providing a generic notification webhook (scheme `generic`, custom form `generic+https`). */
export class GenericService implements Service {
  private readonly logger = new Standard();
  private readonly templater = new Templater();
  private config: Config;
  private pkr: PropKeyResolver;

  constructor() {
    const { config, pkr } = defaultConfig();
    this.config = config;
    this.pkr = pkr;
  }

  setLogger(logger: Logger): void {
    this.logger.setLogger(logger);
  }

  /** Initialize loads config from the service URL and stores the logger. */
  initialize(url: URL, logger?: Logger): void {
    if (logger) {
      this.logger.setLogger(logger);
    }
    if (url.protocol.toLowerCase().startsWith(`${Scheme}+`)) {
      const rawWebhookURL = url.href.replace(new RegExp(`^${Scheme}\\+`, "i"), "");
      const { config, pkr } = configFromWebhookURL(rawWebhookURL);
      // Go's router converts a custom URL to a service URL and initializes it again.
      // That round-trip normalizes the query with Go's url.Values encoding.
      const serviceURL = config.getURLWith(pkr);
      const defaults = defaultConfig();
      defaults.config.setURLWith(defaults.pkr, serviceURL);
      this.config = defaults.config;
      this.pkr = defaults.pkr;
    } else {
      const { config, pkr } = defaultConfig();
      this.config = config;
      this.pkr = pkr;
      this.config.setURLWith(this.pkr, url);
    }
  }

  /** SetTemplateString compiles an inline template for use via the `template=` config. */
  setTemplateString(id: string, body: string): void {
    this.templater.setTemplateString(id, body);
  }

  /** GetConfigURLFromCustom converts a `generic+<scheme>://` custom URL into a `generic://` service URL. */
  getConfigURLFromCustom(customURL: URL): URL {
    let raw = customURL.href;
    if (raw.toLowerCase().startsWith(`${Scheme}+`)) {
      // Strip the "generic+" prefix from the scheme (e.g. generic+https -> https).
      raw = raw.slice(Scheme.length + 1);
    }
    const { config, pkr } = configFromWebhookURL(raw);
    return config.getURLWith(pkr);
  }

  /** Send dispatches the message to the configured webhook endpoint. */
  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    // Work on a copy of the config so per-send param overrides don't leak.
    const config = this.cloneConfig();
    const resolver = new PropKeyResolver(config as never, configSchema);

    const sendParamsInput: Params = params ? { ...params } : {};
    // Mirror Go: log (don't throw on) the first invalid/unknown param and proceed with the send.
    try {
      resolver.updateConfigFromParams(sendParamsInput);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.logf("Failed to update params: %v", reason);
    }

    const sendParams = createSendParams(config, sendParamsInput, message);

    try {
      await this.doSend(config, sendParams, options);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `an error occurred while sending notification to generic webhook: ${reason}`,
      );
    }
  }

  private cloneConfig(): Config {
    const config = Object.assign(
      Object.create(Object.getPrototypeOf(this.config) as object),
      this.config,
    ) as Config;
    // Shallow copies are sufficient; maps/URL are not mutated during send.
    config.headers = { ...this.config.headers };
    config.extraData = { ...this.config.extraData };
    return config;
  }

  private async doSend(config: Config, params: Params, options?: ServiceSendOptions): Promise<void> {
    const postURL = config.webhookURLString();
    const payload = this.getPayload(config, params);

    const headers: Record<string, string> = {
      "Content-Type": config.contentType,
      Accept: config.contentType,
    };
    for (const [key, value] of Object.entries(config.headers)) {
      headers[key] = value;
    }

    const method = config.requestMethod.toUpperCase();
    let responseBody: string;
    let responseStatus: number;
    if ((method === "GET" || method === "HEAD") && !getTransport()) {
      const response = await requestWithBody(
        config.requestMethod,
        postURL,
        headers,
        payload,
        options?.signal,
      );
      responseBody = response.body;
      responseStatus = response.status;
    } else {
      const client = new JsonClient();
      const response = await client.request(config.requestMethod, postURL, {
        headers,
        contentType: config.contentType,
        body: payload,
        signal: options?.signal,
      });
      responseBody = await response.text();
      responseStatus = response.status;
    }

    this.logger.logf("Server response: %s", responseBody);

    if (responseStatus >= 300) {
      throw new Error(`server returned response status code ${responseStatus}`);
    }
  }

  /** getPayload builds the request body based on the configured template. */
  getPayload(config: Config, params: Params): string {
    switch (config.template) {
      case "":
        return params[config.messageKey] ?? "";
      case "json":
      case "JSON":
        return jsonPayload(params, config.extraData);
      default: {
        const { template, found } = this.templater.getTemplate(config.template);
        if (!found || !template) {
          throw new Error(`template "${config.template}" has not been loaded`);
        }
        return template.execute(params);
      }
    }
  }
}

/**
 * createSendParams remaps the title param onto the configured titleKey and injects the message
 * under the configured messageKey. Faithful port of Go `createSendParams`.
 */
export function createSendParams(
  config: Config,
  params: Params,
  message: string,
): Params {
  const sendParams: Params = {};
  for (const [key, val] of Object.entries(params)) {
    const target = key === TitleKey ? config.titleKey : key;
    sendParams[target] = val;
  }
  sendParams[config.messageKey] = message;
  return sendParams;
}
