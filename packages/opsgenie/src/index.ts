import { JsonClient, type Logger, type Params, type Service, type ServiceSendOptions } from "@shoutrrr-ts/core-internal";

type Entity = { type: string; id?: string; name?: string; username?: string };
type Value = string | string[] | Record<string, string> | Entity[];
const keys = new Set(["alias", "description", "responders", "visibleto", "actions", "tags", "details", "entity", "source", "priority", "note", "user", "title"]);
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function parseValue(key: string, value: string): Value {
  if (key === "actions" || key === "tags") return value.split(",");
  if (key === "details") {
    const details: Record<string, string> = {};
    for (const pair of value.split(",")) {
      const parts = pair.split(":");
      if (parts.length !== 2) throw new Error("invalid details format");
      details[parts[0] ?? ""] = parts[1] ?? "";
    }
    return details;
  }
  if (key === "responders" || key === "visibleto") {
    return value.split(",").map((item): Entity => {
      const parts = item.split(":");
      if (parts.length !== 2) throw new Error("invalid entity format");
      const type = parts[0] ?? "";
      const identifier = parts[1] ?? "";
      if (idPattern.test(identifier)) return { type, id: identifier };
      if (type === "team") return { type, name: identifier };
      if (type === "user") return { type, username: identifier };
      throw new Error("invalid entity type");
    });
  }
  return value;
}

function apply(fields: Record<string, Value>, params: Params): void {
  for (const [rawKey, value] of Object.entries(params)) {
    const key = rawKey.toLowerCase();
    if (!keys.has(key)) throw new Error("invalid OpsGenie option");
    fields[key] = parseValue(key, value);
  }
}

/** OpsGenie alert adapter for the pinned Go service's webhook configuration. */
export class OpsGenieService implements Service {
  private apiKey = "";
  private host = "";
  private port = 443;
  private fields: Record<string, Value> = {};

  setLogger(_logger: Logger): void {}

  initialize(url: URL): void {
    this.host = url.hostname;
    this.apiKey = decodeURIComponent(url.pathname.slice(1));
    this.port = url.port ? Number(url.port) : 443;
    if (!Number.isInteger(this.port) || this.port < 0 || this.port > 65535) throw new Error("invalid OpsGenie port");
    this.fields = {};
    for (const key of new Set(url.searchParams.keys())) {
      apply(this.fields, { [key]: url.searchParams.get(key) ?? "" });
    }
  }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    const fields = { ...this.fields };
    apply(fields, params ?? {});
    const title = String(fields.title ?? "");
    const bytes = Buffer.from(message);
    const alert = title || (bytes.length > 130 ? bytes.subarray(0, 130).toString() : message);
    let description = title || bytes.length > 130 ? message : "";
    if (fields.description && description) description += "\n";
    description += String(fields.description ?? "");
    const payload: Record<string, Value> = { message: alert };
    for (const key of ["alias", "responders", "visibleto", "actions", "tags", "details", "entity", "source", "priority", "user", "note"] as const) {
      const value = fields[key];
      if (value !== undefined && (typeof value !== "string" || value !== "") && (!Array.isArray(value) || value.length > 0)) {
        payload[key === "visibleto" ? "visibleTo" : key] = value;
      }
    }
    if (description) payload.description = description;
    const response = await new JsonClient().request("POST", `https://${this.host}:${this.port}/v2/alerts`, {
      body: JSON.stringify(payload), contentType: "application/json",
      headers: { Authorization: `GenieKey ${this.apiKey}` }, signal: options?.signal,
    });
    if (response.status < 200 || response.status >= 300) throw new Error("OpsGenie delivery rejected");
    await response.arrayBuffer();
  }
}

export const descriptor = { schemes: ["opsgenie"] as const, factory: (): OpsGenieService => new OpsGenieService() };
