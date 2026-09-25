/**
 * @woodpecker-js/core — canonical shared core for the shoutrrr Node.js port.
 *
 * The service registry starts EMPTY; services self-register via
 * `registerService` during the integration pass.
 */

export { createEnumFormatter, EnumInvalid } from "./enumFormatter.ts";
export type { FieldSchema, FieldType, URLPart } from "./format.ts";
export {
  getConfigFieldString,
  goQueryEscape,
  parseBool,
  printBool,
  setConfigField,
} from "./format.ts";
export type { FetchLike, JsonClientOptions } from "./jsonclient.ts";
export { ApiError, ContentType, JsonClient, parseBody } from "./jsonclient.ts";

export { KEY_PREFIX, PropKeyResolver } from "./propKeyResolver.ts";
export type { ServiceFactory } from "./router.ts";
export {
  extractScheme,
  getServiceFactory,
  registerService,
  ServiceRouter,
} from "./router.ts";
export { createSender, newSender, send, setLogger } from "./shoutrrr.ts";
export { EnumlessConfig, Standard } from "./standard.ts";
export type {
  ConfigProp,
  EnumFormatter,
  Logger,
  Params,
  Service,
  ServiceConfig,
  ServiceSendOptions,
} from "./types.ts";
export { MessageLevel } from "./types.ts";
export { getTransport, withTransport } from "./transport.ts";
export type { HttpTransport } from "./transport.ts";
