# Compatibility

`shoutrrr-ts` currently supports **Generic Webhook** URLs only. Go Shoutrrr commit `ccf8139` is the behavioral authority. The implementation was bootstrapped from the woodpecker snapshot recorded in `THIRD_PARTY_NOTICES.md`.

Supported forms include `generic://` and `generic+https://` URLs, Generic request options, custom `@Header` values, and `$` JSON fields. Generic defaults to HTTPS. `disabletls=yes` is the explicit HTTP selector; no implicit downgrade occurs.

Node Fetch may add transport headers that differ from Go's HTTP client. These runtime-generated headers are intentionally excluded from service compatibility assertions. Raw webhook URLs are privileged configuration, not untrusted input: parsing does not prevent SSRF, and applications must not accept destinations from attackers.

## Service promotion gate

A service is public only after URL, request, failure, redaction, Node runtime, and documentation checks pass. Other imported service implementations are not registered or supported.
