import { descriptor as bark } from "@shoutrrr-ts/bark-internal";
import { registerService } from "@shoutrrr-ts/core-internal";
import { descriptor } from "@shoutrrr-ts/generic-internal";
import { descriptor as gotify } from "@shoutrrr-ts/gotify-internal";
import { descriptor as join } from "@shoutrrr-ts/join-internal";
import { descriptor as mattermost } from "@shoutrrr-ts/mattermost-internal";
import { descriptor as pushover } from "@shoutrrr-ts/pushover-internal";
import { descriptor as rocketchat } from "@shoutrrr-ts/rocketchat-internal";

let registered = false;

/** Registers the services that have passed this package's public compatibility gate. */
export function registerStableServices(): void {
  if (registered) return;
  for (const scheme of descriptor.schemes) registerService(scheme, descriptor.factory);
  for (const scheme of bark.schemes) registerService(scheme, bark.factory);
  for (const scheme of gotify.schemes) registerService(scheme, gotify.factory);
  for (const scheme of join.schemes) registerService(scheme, join.factory);
  for (const scheme of mattermost.schemes) registerService(scheme, mattermost.factory);
  for (const scheme of pushover.schemes) registerService(scheme, pushover.factory);
  for (const scheme of rocketchat.schemes) registerService(scheme, rocketchat.factory);
  registered = true;
}
