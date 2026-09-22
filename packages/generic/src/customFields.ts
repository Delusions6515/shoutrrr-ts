/**
 * Custom-fields query helpers — service-local because @woodpecker-js/core does not
 * export a custom-fields query builder. Faithful port of Go
 * `BuildQueryWithCustomFields` / `SetConfigPropsFromQuery`, using core's
 * `KEY_PREFIX` ('__') to escape webhook query keys that collide with config
 * prop keys.
 */
import { KEY_PREFIX, type PropKeyResolver } from "@shoutrrr-ts/core-internal";

/** EscapeKey prefixes a config-prop-colliding custom query key. */
function escapeKey(key: string): string {
  return KEY_PREFIX + key;
}

/**
 * buildQueryWithCustomFields writes the resolver's non-default prop fields onto the query,
 * first escaping any pre-existing webhook query keys that share a config prop key.
 */
export function buildQueryWithCustomFields(
  resolver: PropKeyResolver,
  query: URLSearchParams,
): URLSearchParams {
  const fields = resolver.queryFields();
  const skipEscape = [...query.keys()].length < 1;

  for (const key of fields) {
    if (!skipEscape) {
      // Escape any webhook query keys using the same name as service props.
      const escValues = query.getAll(key);
      if (escValues.length > 0) {
        query.delete(key);
        for (const v of escValues) {
          query.append(escapeKey(key), v);
        }
      }
    }

    if (!resolver.keyIsPrimary(key)) {
      continue;
    }

    let value: string;
    try {
      value = resolver.get(key);
    } catch {
      continue;
    }

    if (resolver.isDefault(key, value)) {
      continue;
    }

    query.set(key, value);
  }

  return query;
}

/**
 * setConfigPropsFromQuery sets config props from query values and returns a query with all config
 * prop keys removed and escaped keys unescaped. Faithful port of the Go function.
 */
export function setConfigPropsFromQuery(
  resolver: PropKeyResolver,
  query: URLSearchParams,
): URLSearchParams {
  let firstError: Error | undefined;
  for (const key of resolver.queryFields()) {
    const values = query.getAll(key);
    if (values.length > 0) {
      try {
        resolver.set(key, values[0] as string);
      } catch (err) {
        if (!firstError) {
          firstError = err instanceof Error ? err : new Error(String(err));
        }
      }
    }
    query.delete(key);

    const escKey = escapeKey(key);
    const escValues = query.getAll(escKey);
    if (escValues.length > 0) {
      query.delete(escKey);
      for (const v of escValues) {
        query.append(key, v);
      }
    }
  }
  if (firstError) {
    throw firstError;
  }
  return query;
}
