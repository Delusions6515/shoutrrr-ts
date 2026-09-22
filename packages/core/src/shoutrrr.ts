/**
 * Top-level convenience API — port of Go `shoutrrr.go`.
 */

import { ServiceRouter } from "./router.ts";
import type { Logger, ServiceSendOptions } from "./types.ts";

let defaultLogger: Logger | undefined;

/** Sets the logger used by the default `send` router. */
export function setLogger(logger: Logger): void {
  defaultLogger = logger;
}

/** Sends a single message to the service identified by `rawURL`. */
export async function send(rawURL: string, message: string, options?: ServiceSendOptions): Promise<void> {
  const router = new ServiceRouter(defaultLogger);
  const service = router.locate(rawURL);
  await service.send(message, undefined, options);
}

/** Returns a router configured to send to all the supplied URLs. */
export function createSender(...rawURLs: string[]): ServiceRouter {
  const router = new ServiceRouter();
  for (const rawURL of rawURLs) {
    router.addService(rawURL);
  }
  return router;
}

/** Like `createSender`, but writes log output to `logger`. */
export function newSender(logger: Logger, ...rawURLs: string[]): ServiceRouter {
  const router = new ServiceRouter(logger);
  for (const rawURL of rawURLs) {
    router.addService(rawURL);
  }
  return router;
}
