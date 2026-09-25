# shoutrrr-ts

A Node.js ESM package for verified [Shoutrrr](https://github.com/containrrr/shoutrrr) notification URLs. It supports Node.js 22 and 24.

```ts
import { send } from "shoutrrr-ts";

await send("generic+https://hooks.example.test/notify", "Deployment complete");
```

Use `createSender(urlA, urlB)` for best-effort fan-out, or `sendDetailed(urls, message, { timeoutMs })` for ordered, redacted per-target outcomes. A timeout settles only its affected target's outcome; physical cancellation depends on the selected transport.

## Host HTTP transport

Pass a Fetch-shaped `HttpTransport` to `send`, `createSender`, or `sendDetailed`. Every request from a supported service then uses that transport, including Generic GET/HEAD requests with bodies and ntfy's raw byte body. Without it, existing transport behavior is unchanged.

```ts
import { createSender, send, sendDetailed, type HttpTransport } from "shoutrrr-ts";

// Adapt your host's configured HTTP client; do not construct a new client per request.
const transport: HttpTransport = async (url, init) => {
  const body = init?.body;
  if (body != null && typeof body !== "string" && !(body instanceof Uint8Array)) {
    throw new Error("unsupported notification request body");
  }
  const result = await $http.request({
    url,
    method: init?.method ?? "GET",
    headers: Object.fromEntries(new Headers(init?.headers)),
    body,
  });
  return new Response([204, 205, 304].includes(result.statusCode) ? null : result.body ?? "", {
    status: result.statusCode,
  });
};

await send("generic+https://hooks.example.test/notify", "hello", { transport });
const sender = createSender({ transport }, "ntfy://push.example.test/topic");
await sender.sendAsync("hello");
await sendDetailed(["generic+https://hooks.example.test/notify"], "hello", { transport, timeoutMs: 5000 });
```

`$http` above is a placeholder for a caller-owned client (for example, a configured `HTTP()` instance in Sub-Store), not a package dependency. Its adapter must preserve method, URL, headers, body bytes, status and response text; support GET/HEAD bodies; and reject shapes it cannot represent instead of falling back to native `fetch`. Return a Fetch `Response` with a valid status. Follow redirects safely: do not forward Authorization, Cookie or proxy credentials to an unrelated destination. The Node Sub-Store `HTTP()` client was locally probed on Node 24.21.0 with GET/HEAD bodies and a cross-origin redirect; that is not a guarantee for other runtimes or proxy settings. The host controls proxy and request timeouts; this package does not replace its policy.

The optional `RequestInit.signal` indicates cancellation. An adapter should forward it only if its host client supports it; otherwise `sendDetailed`'s `timeoutMs` bounds the reported outcome but cannot prove the underlying network request stopped. Configure the host's own timeout as well. `send` and reusable senders do not impose a deadline. Transport errors are reduced to `notification delivery failed` at the public API; do not log unredacted host errors elsewhere.

## Installation

Install a fixed release version from the tarball attached to each [GitHub Release](releases):

```bash
pnpm add https://github.com/Delusions6515/shoutrrr-ts/releases/download/v0.2.0/shoutrrr-ts-0.2.0.tgz
```

You can also download the asset and install it locally with `pnpm add ./shoutrrr-ts-0.2.0.tgz`. Each release uploads a `SHA256SUMS` checksum file so you can verify the tarball.

## Stable services

| Service | Status | URL forms |
| --- | --- | --- |
| Generic Webhook | Stable | `generic://`, `generic+https://`, `generic+http://` |
| Bark | Stable against Go `ccf8139` local tests | `bark://:device-key@push.example.test` |
| Discord | Stable against Go `ccf8139` local tests | `discord://synthetic-token@hook.example.test` or `/raw` |
| Gotify | Stable against Go `ccf8139` local tests | `gotify://push.example.test/app-token` |
| Google Chat | Stable against Go `ccf8139` local tests | `googlechat://chat.example.test/hook?key=fixture-key&token=fixture-token` (`hangouts://` alias) |
| IFTTT | Stable against Go `ccf8139` local tests | `ifttt://fixture-key.example.test?events=deploy` |
| Join | Stable against Go `ccf8139` local tests | `join://Token:api-key@join?devices=phone` |
| Mattermost | Stable against Go `ccf8139` local tests | `mattermost://push.example.test/webhook-token` |
| ntfy | Stable against Go `ccf8139` local tests | `ntfy://push.example.test/topic` |
| OpsGenie | Stable against Go `ccf8139` local tests | `opsgenie://api.example.test/synthetic-key` |
| Pushover | Stable against Go `ccf8139` local tests | `pushover://Token:api-key@user.example.test` |
| Pushbullet | Stable against Go `ccf8139` local tests | `pushbullet://AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/device-id` |
| Rocket.Chat | Stable against Go `ccf8139` local tests | `rocketchat://push.example.test/token-a/token-b` |
| Slack | Stable against Go `ccf8139` local tests | `slack://hook:PART1-PART2-PART3@webhook` or API-token URL |
| Microsoft Teams | Stable against Go `ccf8139` local tests | `teams://group-uuid@tenant-uuid/alt-id/owner-uuid` or `teams+https://` webhook shortcut |
| Telegram | Stable against Go `ccf8139` local tests; see the HTTP-200 rejection caveat in [COMPATIBILITY.md](COMPATIBILITY.md) | `telegram://12345:synthetic@telegram?chats=123` |
| Zulip | Stable against Go `ccf8139` local tests | `zulip://bot%40example.test:api-key@chat.example.test?stream=alerts` |

## Security

Webhook URLs are trusted, privileged configuration. Do not pass attacker-controlled URLs to this package: URL parsing is **not** SSRF protection. HTTPS is the default. Use `disabletls=yes` or `generic+http://` only when HTTP is explicitly required; credentials sent over HTTP are visible on the network.

`parseURL()` and `formatURL()` preserve a privileged configuration URL for an explicit round trip. Use `redactURL()` for every log, error, or user-facing display; parsed URL objects intentionally omit raw state from JSON serialization.

## Compatibility and licensing

The seventeen services listed above are stable against the documented Go revision; other Shoutrrr services are unsupported and rejected before requests are made. Go Shoutrrr is the behavioral authority; local tests do not verify live platform delivery. Compatibility details are in [COMPATIBILITY.md](COMPATIBILITY.md).

This distribution is licensed under AGPL-3.0-only. It includes adapted MIT-licensed woodpecker source and its notice in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This project is not affiliated with Shoutrrr or woodpecker.

## Development

Use pnpm: `pnpm install`, `pnpm check`. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
