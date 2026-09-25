import { createSender as createCoreSender, send as sendCore, withTransport } from "@shoutrrr-ts/core-internal";
import type { HttpTransport } from "@shoutrrr-ts/core-internal";
import { registerStableServices } from "./register-stable-services.ts";
import { parseURL, redactURL } from "./url-tools.ts";

registerStableServices();

export { formatURL, parseURL, redactURL, validateURL } from "./url-tools.ts";
export type { ParsedURL } from "./url-tools.ts";

/** Fetch-shaped transport; Generic GET/HEAD notifications require support for request bodies. */
export type { HttpTransport } from "@shoutrrr-ts/core-internal";

export interface Sender {
  send(message: string, params?: Record<string, string>, options?: Pick<SendOptions, "signal">): Promise<Error[]>;
  sendAsync(message: string, params?: Record<string, string>, options?: Pick<SendOptions, "signal">): Promise<Error[]>;
}

export interface SendOptions {
  /** Use this transport for the delivery instead of the built-in HTTP transport. */
  transport?: HttpTransport;
  /** Per-target timeout in milliseconds. Omit to use the transport's normal behavior. */
  timeoutMs?: number;
  /** Cancels this target without affecting any other target. */
  signal?: AbortSignal;
}

export interface SendOutcome {
  index: number;
  service: string;
  destination: string;
  elapsedMs: number;
  error?: string;
}

class RequestTimeoutError extends Error {
  constructor() {
    super("request timed out");
  }
}

function publicError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("unknown service")) return new Error("service is not supported by shoutrrr-ts");
  if (error instanceof RequestTimeoutError) return error;
  return new Error("notification delivery failed");
}

/** Sends one message through a registered stable service. */
export async function send(rawURL: string, message: string, options: Pick<SendOptions, "signal" | "transport"> = {}): Promise<void> {
  try {
    await withTransport(options.transport, () => sendCore(rawURL, message, options));
  } catch (error) {
    throw publicError(error);
  }
}

/** Creates a reusable best-effort sender for stable service URLs. */
export function createSender(...rawURLs: string[]): Sender;
export function createSender(options: Pick<SendOptions, "transport">, ...rawURLs: string[]): Sender;
export function createSender(...args: [Pick<SendOptions, "transport">, ...string[]] | string[]): Sender {
  try {
    const injected = typeof args[0] === "string" ? undefined : args[0]?.transport;
    const rawURLs = typeof args[0] === "string" || args.length === 0 ? args as string[] : args.slice(1) as string[];
    const sender = createCoreSender(...rawURLs);
    return {
      send: async (message, params, options) => (await withTransport(injected, () => sender.send(message, params, options))).map(publicError),
      sendAsync: async (message, params, options) => (await withTransport(injected, () => sender.sendAsync(message, params, options))).map(publicError),
    };
  } catch (error) {
    throw publicError(error);
  }
}

/** Sends all URLs independently and returns input-indexed, redacted outcomes. */
export async function sendDetailed(
  rawURLs: readonly string[],
  message: string,
  options: SendOptions = {},
): Promise<SendOutcome[]> {
  return Promise.all(rawURLs.map(async (rawURL, index) => {
    const started = performance.now();
    let service = "unknown";
    let destination = "<invalid-url>";
    try {
      const parsed = parseURL(rawURL);
      const redacted = redactURL(rawURL);
      service = parsed.scheme;
      destination = redacted;
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (options.signal?.aborted) controller.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        const delivery = send(rawURL, message, { signal: controller.signal, transport: options.transport });
        if (options.timeoutMs === undefined) {
          await delivery;
        } else {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              controller.abort();
              reject(new RequestTimeoutError());
            }, options.timeoutMs);
            delivery.then(resolve, reject).finally(() => clearTimeout(timer));
          });
        }
      } finally {
        options.signal?.removeEventListener("abort", abort);
      }
      return { index, service, destination, elapsedMs: performance.now() - started };
    } catch (error) {
      return {
        index,
        service,
        destination,
        elapsedMs: performance.now() - started,
        error: publicError(error).message,
      };
    }
  }));
}
