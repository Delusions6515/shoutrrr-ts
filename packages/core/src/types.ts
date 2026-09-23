/**
 * Core type definitions for shoutrrr.
 *
 * Ported from Go `pkg/types`. These are the canonical shapes that the rest of
 * the workspace depends on.
 */

/** Params is a free-form key/value bag passed alongside a message. */
export type Params = Record<string, string>;

/**
 * MessageLevel denotes the urgency of a message item.
 *
 * Note: the numeric ordering here follows the workspace spec, not the Go
 * source (which orders Debug..Error). Other packages vendor this exact shape.
 */
export enum MessageLevel {
  Unknown = 0,
  Error,
  Warning,
  Info,
  Debug,
}

/** EnumFormatter maps between enum integer values and their string names. */
export interface EnumFormatter {
  print(e: number): string;
  parse(s: string): number;
  names(): string[];
}

/** ConfigProp is a config field that serializes to/from a single string. */
export interface ConfigProp {
  setFromProp(v: string): void;
  getPropValue(): string;
}

/** Logger is the minimal logging surface used by services. */
export interface Logger {
  logf(format: string, ...args: unknown[]): void;
}

/** ServiceConfig is the common interface for all service configurations. */
export interface ServiceConfig {
  getURL(): URL;
  setURL(u: URL): void;
  enums(): Record<string, EnumFormatter>;
}

/** Per-delivery controls shared by stable services. */
export interface ServiceSendOptions {
  signal?: AbortSignal;
}

/** Service is the public common interface for all notification services. */
export interface Service {
  initialize(u: URL, logger?: Logger, rawURL?: string): void;
  setLogger(l: Logger): void;
  send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void>;
}
