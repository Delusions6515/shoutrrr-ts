# Contributing

Use pnpm and run `pnpm check` before proposing changes. New services remain private until they pass the compatibility, request, failure, redaction, Node runtime, and documentation promotion gate described in `COMPATIBILITY.md`.

Do not add live webhook URLs, credentials, private hosts, or local paths to code, fixtures, or documentation.

## Releasing

Releases are built and attached to GitHub Releases as a tarball; this package is not published to npm. To cut a release:

1. Bump the `version` field in `package.json`.
2. Push a tag matching that version, e.g. `v0.2.0`.
3. The `Release` workflow in `.github/workflows/release.yml` verifies the tag, runs `pnpm check`, packs `shoutrrr-ts-<version>.tgz`, uploads `SHA256SUMS`, and creates a GitHub Release with both files as assets.

Installers use the release asset URL, as documented in the README.
