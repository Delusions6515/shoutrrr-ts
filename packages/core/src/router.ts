/**
 * Service router — port of Go `pkg/router`.
 *
 * Maintains a global scheme->factory registry and routes messages to the
 * services located from notification URLs. The scheme is the URL protocol
 * (minus the trailing ':'), lower-cased, with anything after a '+' stripped
 * (e.g. `slack+webhook` => `slack`).
 */
import type { Logger, Params, Service, ServiceSendOptions } from "./types.ts";

/** Factory that produces a fresh, uninitialized service instance. */
export type ServiceFactory = () => Service;

const registry = new Map<string, ServiceFactory>();

/** Registers a service factory for a URL scheme (lower-cased). */
export function registerService(scheme: string, factory: ServiceFactory): void {
  registry.set(scheme.toLowerCase(), factory);
}

/** Returns the factory registered for a scheme, or undefined. */
export function getServiceFactory(scheme: string): ServiceFactory | undefined {
  return registry.get(scheme.toLowerCase());
}

/** Extracts the base scheme from a raw URL: lower-cased, split on '+'. */
export function extractScheme(rawURL: string): string {
  const url = new URL(rawURL);
  const protocol = url.protocol.replace(/:$/, "");
  return protocol.toLowerCase().split("+")[0] as string;
}

export class ServiceRouter {
  private readonly logger?: Logger;
  private readonly services: Service[] = [];

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /** Locates and initializes the service for a raw URL (does not store it). */
  locate(rawURL: string): Service {
    const scheme = extractScheme(rawURL);
    const factory = getServiceFactory(scheme);
    if (!factory) {
      throw new Error(`unknown service ${JSON.stringify(scheme)}`);
    }
    const service = factory();
    service.initialize(new URL(rawURL), this.logger, rawURL);
    return service;
  }

  /** Locates a service from its URL and adds it to the router. */
  addService(rawURL: string): void {
    this.services.push(this.locate(rawURL));
  }

  /** Sends to all services, collecting (not throwing) the errors. */
  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<Error[]> {
    const errors: Error[] = [];
    for (const service of this.services) {
      try {
        await service.send(message, params, options);
      } catch (err) {
        errors.push(toError(err));
      }
    }
    return errors;
  }

  /** Sends to all services concurrently, collecting the errors. */
  async sendAsync(message: string, params?: Params, options?: ServiceSendOptions): Promise<Error[]> {
    const results = await Promise.all(
      this.services.map(async (service): Promise<Error | undefined> => {
        try {
          await service.send(message, params, options);
          return undefined;
        } catch (err) {
          return toError(err);
        }
      }),
    );
    return results.filter((e): e is Error => e !== undefined);
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
