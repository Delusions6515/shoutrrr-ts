import {
  EnumlessConfig, PropKeyResolver, createEnumFormatter,
  type EnumFormatter, type FieldSchema, type Logger, type Params, type Service, type ServiceSendOptions,
} from "@shoutrrr-ts/core-internal";

const priorityEnum = createEnumFormatter(
  ["", "Min", "Low", "Default", "High", "Max"],
  { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, urgent: 5 },
);
const fields: FieldSchema[] = [
  { name: "title", key: ["title"], default: "" },
  { name: "scheme", key: ["scheme"], default: "https" },
  { name: "tags", key: ["tags"], type: "string[]" },
  { name: "priority", key: ["priority"], type: "enum", enumName: "Priority", default: "default" },
  { name: "actions", key: ["actions"], type: "string[]", separator: ";" },
  { name: "click", key: ["click"] },
  { name: "attach", key: ["attach"] },
  { name: "filename", key: ["filename"] },
  { name: "delay", key: ["delay", "at", "in"] },
  { name: "email", key: ["email"] },
  { name: "icon", key: ["icon"] },
  { name: "cache", key: ["cache"], type: "bool", default: "yes" },
  { name: "firebase", key: ["firebase"], type: "bool", default: "yes" },
  { name: "markdown", key: ["markdown"], type: "bool", default: "no" },
];

class NtfyConfig extends EnumlessConfig {
  host = "ntfy.sh";
  topic = "";
  username = "";
  password = "";
  title = "";
  scheme = "https";
  tags: string[] = [""];
  priority = 3;
  actions: string[] = [""];
  click = "";
  attach = "";
  filename = "";
  delay = "";
  email = "";
  icon = "";
  cache = true;
  firebase = true;
  markdown = false;

  override enums(): Record<string, EnumFormatter> { return { Priority: priorityEnum }; }
  getURL(): URL {
    const value = new URL(`ntfy://${this.host || "invalid.example.test"}/${this.topic}`);
    value.username = this.username; value.password = this.password;
    value.search = new PropKeyResolver(this, fields).buildQuery();
    return value;
  }
  setURL(value: URL): void {
    this.host = value.host;
    this.topic = decodeURIComponent(value.pathname).replace(/^\//, "");
    this.username = decodeURIComponent(value.username);
    this.password = decodeURIComponent(value.password);
    const resolver = new PropKeyResolver(this, fields);
    // Upstream escapes raw semicolons before parsing query options.
    const query = new URLSearchParams(value.search.slice(1).replace(/;/g, "%3B"));
    for (const key of new Set(query.keys())) resolver.set(key, query.get(key) ?? "");
  }
}

/** ntfy adapter with Go's raw-body and header behavior. */
export class NtfyService implements Service {
  private readonly config = new NtfyConfig();
  private readonly resolver = new PropKeyResolver(this.config, fields);

  setLogger(_logger: Logger): void {}
  initialize(value: URL, _logger?: Logger): void {
    this.resolver.setDefaultProps();
    this.config.setURL(value);
  }

  async send(message: string, params?: Params, options?: ServiceSendOptions): Promise<void> {
    this.resolver.updateConfigFromParams(params);
    const config = this.config;
    const url = new URL(`${config.scheme}://${config.host}`);
    url.pathname = config.topic.startsWith("/") ? config.topic : `/${config.topic}`;
    const headers: Record<string, string> = { "User-Agent": "shoutrrr/0.6-dev" };
    const optional: Record<string, string> = {
      Title: config.title, Priority: priorityEnum.print(config.priority), Tags: config.tags.join(","),
      Delay: config.delay, Actions: config.actions.join(";"), Click: config.click,
      Attach: config.attach, "X-Icon": config.icon, Filename: config.filename, Email: config.email,
    };
    for (const [key, value] of Object.entries(optional)) if (value) headers[key] = value;
    if (!config.cache) headers.Cache = "no";
    if (!config.firebase) headers.Firebase = "no";
    if (config.markdown) headers.Markdown = "yes";
    if (config.password) headers.Authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    // A byte body prevents Fetch from adding text/plain, absent from Go's request.
    const response = await fetch(url, { method: "POST", body: Buffer.from(message), headers, signal: options?.signal });
    const text = await response.text();
    try { JSON.parse(text); } catch { throw new Error("ntfy returned invalid JSON"); }
    if (response.status >= 400) throw new Error("ntfy delivery was rejected");
  }
}

export const descriptor = {
  schemes: ["ntfy"] as const,
  factory: (): NtfyService => new NtfyService(),
};
