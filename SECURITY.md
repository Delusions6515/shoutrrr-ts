# Security

Please report security vulnerabilities privately through the repository's security advisory contact. Do not include real credentials or production webhook URLs in reports.

Webhook URLs are privileged configuration. Applications must enforce their own destination policy when URLs can originate from untrusted users.

An injected HTTP transport owns redirect handling. It must not forward Authorization, Cookie, or proxy credentials to an unrelated redirect destination, and must reject requests it cannot safely represent rather than switching to an alternate client. Host-client errors may contain privileged URLs; expose only the package's redacted public outcomes.
