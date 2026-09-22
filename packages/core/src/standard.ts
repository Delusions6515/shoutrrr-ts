/**
 * Standard service helpers — port of Go `pkg/services/standard`.
 *
 * `Standard` provides the logging surface every service embeds; `EnumlessConfig`
 * is the base config for services that have no enum fields.
 */
import type { EnumFormatter, Logger } from "./types.ts";

/** Base class providing logger plumbing for services. */
export class Standard implements Logger {
  protected logger?: Logger;

  /** Sets the logger this service writes progress logs to. */
  setLogger(l: Logger): void {
    this.logger = l;
  }

  /** Writes a formatted log line via the configured logger (no-op if unset). */
  logf(format: string, ...args: unknown[]): void {
    this.logger?.logf(format, ...args);
  }
}

/** Base config for services without enum fields. */
export class EnumlessConfig {
  enums(): Record<string, EnumFormatter> {
    return {};
  }
}
