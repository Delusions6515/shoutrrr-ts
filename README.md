# shoutrrr-ts

A Node.js ESM package for verified [Shoutrrr](https://github.com/containrrr/shoutrrr) notification URLs. It supports Node.js 22 and 24.

```ts
import { send } from "shoutrrr-ts";

await send("generic+https://hooks.example.test/notify", "Deployment complete");
```

Use `createSender(urlA, urlB)` for best-effort fan-out, or `sendDetailed(urls, message, { timeoutMs })` for ordered, redacted per-target outcomes. A timeout cancels only its affected target.

## Stable services

| Service | Status | URL forms |
| --- | --- | --- |
| Generic Webhook | Stable | `generic://`, `generic+https://`, `generic+http://` |
| Bark | Stable against Go `ccf8139` local tests | `bark://:device-key@push.example.test` |
| Gotify | Stable against Go `ccf8139` local tests | `gotify://push.example.test/app-token` |
| Google Chat | Stable against Go `ccf8139` local tests | `googlechat://chat.example.test/hook?key=fixture-key&token=fixture-token` (`hangouts://` alias) |
| IFTTT | Stable against Go `ccf8139` local tests | `ifttt://fixture-key.example.test?events=deploy` |
| Join | Stable against Go `ccf8139` local tests | `join://Token:api-key@join?devices=phone` |
| Mattermost | Stable against Go `ccf8139` local tests | `mattermost://push.example.test/webhook-token` |
| ntfy | Stable against Go `ccf8139` local tests | `ntfy://push.example.test/topic` |
| Pushover | Stable against Go `ccf8139` local tests | `pushover://Token:api-key@user.example.test` |
| Pushbullet | Stable against Go `ccf8139` local tests | `pushbullet://AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/device-id` |
| Rocket.Chat | Stable against Go `ccf8139` local tests | `rocketchat://push.example.test/token-a/token-b` |
| Zulip | Stable against Go `ccf8139` local tests | `zulip://bot%40example.test:api-key@chat.example.test?stream=alerts` |

## Security

Webhook URLs are trusted, privileged configuration. Do not pass attacker-controlled URLs to this package: URL parsing is **not** SSRF protection. HTTPS is the default. Use `disabletls=yes` or `generic+http://` only when HTTP is explicitly required; credentials sent over HTTP are visible on the network.

`parseURL()` and `formatURL()` preserve a privileged configuration URL for an explicit round trip. Use `redactURL()` for every log, error, or user-facing display; parsed URL objects intentionally omit raw state from JSON serialization.

## Compatibility and licensing

The twelve services listed above are stable against the documented Go revision; other Shoutrrr services are unsupported and rejected before requests are made. Go Shoutrrr is the behavioral authority; local tests do not verify live platform delivery. Compatibility details are in [COMPATIBILITY.md](COMPATIBILITY.md).

This distribution is licensed under AGPL-3.0-only. It includes adapted MIT-licensed woodpecker source and its notice in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This project is not affiliated with Shoutrrr or woodpecker.

## Development

Use pnpm: `pnpm install`, `pnpm check`. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
