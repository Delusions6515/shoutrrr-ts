const sensitiveQueryNames = /(?:token|secret|password|authorization|auth|key|credential|sig|signature)/i;

export interface ParsedURL {
  /** Original URL retained only for delivery; do not serialize this object for diagnostics. */
  readonly raw: string;
  readonly url: URL;
  readonly scheme: string;
}

/** Parses a privileged Shoutrrr URL. This is not an SSRF validation boundary. */
export function parseURL(raw: string): ParsedURL {
  const url = new URL(raw);
  const parsed = { scheme: url.protocol.slice(0, -1).toLowerCase().split("+")[0] ?? "" } as ParsedURL;
  // Delivery needs raw state, but public inspection objects must serialize safely by default.
  Object.defineProperties(parsed, {
    raw: { value: raw, enumerable: false },
    url: { value: url, enumerable: false },
  });
  return parsed;
}

/** Returns a safe display form suitable for logs, errors, and result serialization. */
export function redactURL(raw: string | URL): string {
  const url = new URL(String(raw));
  if (url.username) url.username = "***";
  if (url.password) url.password = "***";
  for (const [name] of url.searchParams) {
    if (name.startsWith("@") || sensitiveQueryNames.test(name)) url.searchParams.set(name, "***");
  }
  // Generic webhook paths commonly embed opaque receiver tokens; never display path values by default.
  const segments = url.pathname.split("/").map((segment) => segment ? "***" : segment);
  url.pathname = segments.join("/");
  return url.toString();
}

/** Reconstructs the privileged URL for configuration round trips; use `redactURL` for display. */
export function formatURL(parsed: ParsedURL): string {
  return parsed.raw;
}

/** Validates syntax and returns a safe parsed representation. */
export function validateURL(raw: string): ParsedURL {
  return parseURL(raw);
}
