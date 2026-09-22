import { registerService } from "@shoutrrr-ts/core-internal";
import { descriptor } from "@shoutrrr-ts/generic-internal";

let registered = false;

/** Registers the services that have passed this package's public compatibility gate. */
export function registerStableServices(): void {
  if (registered) return;
  for (const scheme of descriptor.schemes) registerService(scheme, descriptor.factory);
  registered = true;
}
