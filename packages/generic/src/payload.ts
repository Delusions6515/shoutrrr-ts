import type { Params } from "@shoutrrr-ts/core-internal";

/**
 * jsonPayload builds the JSON request body for the `json`/`JSON` template, merging the
 * configured extra data fields into the params. Mirrors the json branch of Go `getPayload`.
 */
export function jsonPayload(
  params: Params,
  extraData: Record<string, string>,
): string {
  const merged: Params = { ...params };
  for (const [key, value] of Object.entries(extraData)) {
    merged[key] = value;
  }
  return JSON.stringify(merged);
}
