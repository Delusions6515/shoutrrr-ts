/**
 * JSON HTTP client — port of Go `pkg/util/jsonclient`, generalized to cover the
 * full range of request shapes the services need.
 *
 * - `get` / `post` / `put`  — JSON body + JSON response, throw `ApiError` on non-2xx.
 * - `postForm`              — application/x-www-form-urlencoded body, JSON response.
 * - `request`               — raw escape hatch (arbitrary method/headers/body),
 *                             returns the `Response` without throwing.
 *
 * Built on the standard `fetch` API so it runs identically on Bun and Node. The
 * transport is injectable two ways: an undici `Dispatcher` (Node connection
 * pool / proxy / MockAgent) or a `fetch` override (`FetchLike`, used by tests on
 * Bun where undici's MockAgent does not work).
 */
/** Default content type for JSON (port of jsonclient.ContentType). */
export const ContentType = "application/json";

/** Error thrown on a non-2xx JSON response, carrying the parsed body. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly body: unknown;

  constructor(statusCode: number, body: unknown) {
    super(`unknown error (HTTP ${statusCode})`);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

/** Minimal fetch shape so the transport can be injected/overridden in tests. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface JsonClientOptions {
  /** Override the native Fetch transport for deterministic tests or proxy support. */
  fetch?: FetchLike;
}

export class JsonClient {
  /** Extra headers applied to every request (e.g. Authorization). */
  headers: Record<string, string> = {};
  private readonly fetchImpl: FetchLike;

  constructor(opts: JsonClientOptions = {}) {
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  /** GET with a JSON response. */
  async get<T>(url: string): Promise<T> {
    const res = await this.request("GET", url);
    return this.parseChecked<T>(res);
  }

  /** POST a JSON body and parse the JSON response. */
  async post<TRes>(url: string, body: unknown): Promise<TRes> {
    const res = await this.request("POST", url, {
      body: JSON.stringify(body),
      contentType: ContentType,
    });
    return this.parseChecked<TRes>(res);
  }

  /** PUT a JSON body and parse the JSON response. */
  async put<TRes>(url: string, body: unknown): Promise<TRes> {
    const res = await this.request("PUT", url, {
      body: JSON.stringify(body),
      contentType: ContentType,
    });
    return this.parseChecked<TRes>(res);
  }

  /** POST an application/x-www-form-urlencoded body and parse the JSON response. */
  async postForm<TRes>(
    url: string,
    form: Record<string, string> | URLSearchParams,
  ): Promise<TRes> {
    const body = (
      form instanceof URLSearchParams ? form : new URLSearchParams(form)
    ).toString();
    const res = await this.request("POST", url, {
      body,
      contentType: "application/x-www-form-urlencoded",
    });
    return this.parseChecked<TRes>(res);
  }

  /**
   * Raw request escape hatch — arbitrary method, body, content type and extra
   * headers. Returns the `Response` WITHOUT throwing on non-2xx, so callers
   * with bespoke success/error handling (e.g. the generic webhook) stay in
   * control.
   */
  async request(
    method: string,
    url: string,
    opts: {
      body?: string;
      contentType?: string;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...this.headers,
      ...opts.headers,
    };
    if (
      opts.contentType !== undefined &&
      headers["Content-Type"] === undefined
    ) {
      headers["Content-Type"] = opts.contentType;
    }
    const init: RequestInit = {
      method,
      headers,
      ...(opts.body === undefined ? {} : { body: opts.body }),
      ...(opts.signal === undefined ? {} : { signal: opts.signal }),
    };
    return this.fetchImpl(url, init);
  }

  /** Reads a Response body, parsing JSON; throws ApiError on non-2xx. */
  private async parseChecked<T>(res: Response): Promise<T> {
    const parsed = await parseBody(res);
    if (res.status < 200 || res.status >= 300) {
      throw new ApiError(res.status, parsed);
    }
    return parsed as T;
  }
}

/** Parses a Response body as JSON, tolerating empty (204) and non-JSON bodies. */
export async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
