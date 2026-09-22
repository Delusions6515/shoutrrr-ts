/**
 * Custom query handling for the generic webhook service.
 * Faithful port of Go `pkg/services/generic/custom_query.go`.
 *
 * Query keys prefixed with '@' are custom HTTP headers; keys prefixed with '$' are extra
 * JSON data fields. Header keys are normalized to canonical kebab-cased form.
 */

export const EXTRA_PREFIX = "$";
export const HEADER_PREFIX = "@";

const UPPER_A = "A".charCodeAt(0);
const UPPER_Z = "Z".charCodeAt(0);
const CASE_OFFSET = "a".charCodeAt(0) - "A".charCodeAt(0);
const DASH = "-".charCodeAt(0);

/**
 * normalizedHeaderKey converts a header key to canonical form (e.g. "contentType",
 * "content-type" and "ContentType" all become "Content-Type"). Byte-indexed to match Go.
 */
export function normalizedHeaderKey(key: string): string {
  let out = "";
  for (let i = 0; i < key.length; i++) {
    let code = key.charCodeAt(i);
    if (code >= UPPER_A && code <= UPPER_Z) {
      // Char is uppercase: insert a missing dash if not at start and previous wasn't a dash.
      if (i > 0 && key.charCodeAt(i - 1) !== DASH) {
        out += "-";
      }
    } else if (i === 0 || key.charCodeAt(i - 1) === DASH) {
      // First char, or previous was a dash: uppercase it.
      code -= CASE_OFFSET;
    }
    out += String.fromCharCode(code);
  }
  return out;
}

/** appendCustomQueryValues writes the headers ('@') and extra data ('$') back onto the query. */
export function appendCustomQueryValues(
  query: URLSearchParams,
  headers: Record<string, string>,
  extraData: Record<string, string>,
): void {
  for (const [key, value] of Object.entries(headers)) {
    query.set(HEADER_PREFIX + key, value);
  }
  for (const [key, value] of Object.entries(extraData)) {
    query.set(EXTRA_PREFIX + key, value);
  }
}

/**
 * stripCustomQueryValues removes '@' header and '$' extra-data keys from the query (mutating it)
 * and returns them as normalized maps.
 */
export function stripCustomQueryValues(query: URLSearchParams): {
  headers: Record<string, string>;
  extraData: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const extraData: Record<string, string> = {};

  // Snapshot keys first since we mutate the query while iterating.
  for (const key of [...new Set(query.keys())]) {
    const first = query.getAll(key)[0] ?? "";
    if (key[0] === HEADER_PREFIX) {
      headers[normalizedHeaderKey(key.slice(1))] = first;
    } else if (key[0] === EXTRA_PREFIX) {
      extraData[key.slice(1)] = first;
    } else {
      continue;
    }
    query.delete(key);
  }

  return { headers, extraData };
}
