import { AsyncLocalStorage } from "node:async_hooks";
import type { FetchLike } from "./jsonclient.ts";

/** Fetch-shaped transport for a single notification delivery. GET/HEAD bodies are permitted. */
export type HttpTransport = FetchLike;

const activeTransport = new AsyncLocalStorage<HttpTransport | undefined>();

/** Keeps an injected transport local to this asynchronous delivery and its service calls. */
export function withTransport<T>(transport: HttpTransport | undefined, delivery: () => Promise<T>): Promise<T> {
  return activeTransport.run(transport, delivery);
}

export function getTransport(): HttpTransport | undefined {
  return activeTransport.getStore();
}
