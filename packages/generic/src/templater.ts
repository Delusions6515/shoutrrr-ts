import type { Params } from "@shoutrrr-ts/core-internal";

/** A compiled template that renders params into a string. */
export interface Template {
  execute(params: Params): string;
}

const ACTION = /\{\{\s*\.(\w+)\s*\}\}/g;

/**
 * Minimal templater supporting Go `text/template` field actions of the form `{{ .field }}`.
 * Faithful to the subset exercised by the generic service (key substitution); unknown fields
 * render as the empty string, matching Go's behaviour for missing map keys.
 */
export class Templater {
  private readonly templates = new Map<string, Template>();

  /** SetTemplateString compiles a template from an inline string, throwing on malformed input. */
  setTemplateString(id: string, body: string): void {
    // Reject unbalanced action delimiters (matches text/template parse errors).
    const opens = (body.match(/\{\{/g) ?? []).length;
    const closes = (body.match(/\}\}/g) ?? []).length;
    if (opens !== closes) {
      throw new Error(`template ${id}: unbalanced action delimiters`);
    }
    this.templates.set(id, {
      execute: (params: Params): string =>
        body.replace(ACTION, (_match, field: string) => params[field] ?? ""),
    });
  }

  /** GetTemplate returns the template for id and whether it was found. */
  getTemplate(id: string): { template?: Template; found: boolean } {
    const template = this.templates.get(id);
    return { template, found: template !== undefined };
  }
}
