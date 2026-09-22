import { GenericService } from "./generic.ts";

export type { Logger, Params, Service } from "@shoutrrr-ts/core-internal";
export {
  Config,
  configFromWebhookURL,
  configSchema,
  DefaultWebhookScheme,
  defaultConfig,
  Scheme,
} from "./config.ts";
export {
  appendCustomQueryValues,
  normalizedHeaderKey,
  stripCustomQueryValues,
} from "./customQuery.ts";
export { createSendParams, GenericService } from "./generic.ts";
export { jsonPayload } from "./payload.ts";
export { Templater } from "./templater.ts";

/** Descriptor used by the service registry to construct a GenericService for the `generic` scheme. */
export const descriptor = {
  schemes: ["generic"] as const,
  factory: (): GenericService => new GenericService(),
};
