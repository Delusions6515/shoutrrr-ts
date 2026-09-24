import { descriptor as bark } from "@shoutrrr-ts/bark-internal";
import { registerService } from "@shoutrrr-ts/core-internal";
import { descriptor as discord } from "@shoutrrr-ts/discord-internal";
import { descriptor } from "@shoutrrr-ts/generic-internal";
import { descriptor as gotify } from "@shoutrrr-ts/gotify-internal";
import { descriptor as googlechat } from "@shoutrrr-ts/googlechat-internal";
import { descriptor as ifttt } from "@shoutrrr-ts/ifttt-internal";
import { descriptor as join } from "@shoutrrr-ts/join-internal";
import { descriptor as mattermost } from "@shoutrrr-ts/mattermost-internal";
import { descriptor as ntfy } from "@shoutrrr-ts/ntfy-internal";
import { descriptor as opsGenie } from "@shoutrrr-ts/opsgenie-internal";
import { descriptor as pushover } from "@shoutrrr-ts/pushover-internal";
import { descriptor as pushbullet } from "@shoutrrr-ts/pushbullet-internal";
import { descriptor as rocketchat } from "@shoutrrr-ts/rocketchat-internal";
import { descriptor as slack } from "@shoutrrr-ts/slack-internal";
import { descriptor as teams } from "@shoutrrr-ts/teams-internal";
import { descriptor as telegram } from "@shoutrrr-ts/telegram-internal";
import { descriptor as zulip } from "@shoutrrr-ts/zulip-internal";

let registered = false;

/** Registers the services that have passed this package's public compatibility gate. */
export function registerStableServices(): void {
  if (registered) return;
  for (const scheme of descriptor.schemes) registerService(scheme, descriptor.factory);
  for (const scheme of bark.schemes) registerService(scheme, bark.factory);
  for (const scheme of discord.schemes) registerService(scheme, discord.factory);
  for (const scheme of gotify.schemes) registerService(scheme, gotify.factory);
  for (const scheme of googlechat.schemes) registerService(scheme, googlechat.factory);
  for (const scheme of ifttt.schemes) registerService(scheme, ifttt.factory);
  for (const scheme of join.schemes) registerService(scheme, join.factory);
  for (const scheme of mattermost.schemes) registerService(scheme, mattermost.factory);
  for (const scheme of ntfy.schemes) registerService(scheme, ntfy.factory);
  for (const scheme of opsGenie.schemes) registerService(scheme, opsGenie.factory);
  for (const scheme of pushover.schemes) registerService(scheme, pushover.factory);
  for (const scheme of pushbullet.schemes) registerService(scheme, pushbullet.factory);
  for (const scheme of rocketchat.schemes) registerService(scheme, rocketchat.factory);
  for (const scheme of slack.schemes) registerService(scheme, slack.factory);
  for (const scheme of teams.schemes) registerService(scheme, teams.factory);
  for (const scheme of telegram.schemes) registerService(scheme, telegram.factory);
  for (const scheme of zulip.schemes) registerService(scheme, zulip.factory);
  registered = true;
}
