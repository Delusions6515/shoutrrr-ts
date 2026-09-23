import { readdir, readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

const root = "test/compatibility";
const manifest = JSON.parse(await readFile(`${root}/services.json`, "utf8"));
const services = manifest.services;
const expected = [
  "bark", "discord", "generic", "googlechat", "gotify", "ifttt", "join",
  "matrix", "mattermost", "ntfy", "opsgenie", "pushbullet", "pushover",
  "rocketchat", "slack", "smtp", "teams", "telegram", "zulip",
];
if (!isDeepStrictEqual(Object.keys(services).sort(), expected.sort())) {
  throw new Error("The service ledger must enumerate the 19 upstream push services");
}
if (manifest.upstreamRevision !== "ccf81390b700948f85ce1c79f6de9ee75c68d9e5" ||
    manifest.goBaselineCommand !== "pnpm verify:go-baseline") {
  throw new Error("The Go baseline command and revision must be recorded");
}
const registry = await readFile("src/register-stable-services.ts", "utf8");
const imports = [...registry.matchAll(/from "@shoutrrr-ts\/([a-z]+)-internal"/g)]
  .map((match) => match[1]).filter((service) => service !== "core").sort();
const stable = Object.entries(services).filter(([, info]) => info.status === "stable")
  .map(([name]) => name).sort();
if (!isDeepStrictEqual(imports, stable)) {
  throw new Error("Stable registry imports do not match the evidenced service ledger");
}
let count = 0;
for (const [service, info] of Object.entries(services)) {
  if (!["stable", "pending", "blocked", "deferred"].includes(info.status)) {
    throw new Error(`Invalid evidence state for ${service}`);
  }
  if (info.status !== "stable") continue;
  if (!Array.isArray(info.fixtures) || info.fixtures.length === 0 || info.livePlatform !== "unverified") {
    throw new Error(`Stable service ${service} lacks fixtures or a live-platform boundary`);
  }
  const directory = `${root}/fixtures/${service}`;
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
  if (!isDeepStrictEqual(files.map((file) => file.slice(0, -5)).sort(), [...info.fixtures].sort())) {
    throw new Error(`Fixture names for ${service} differ from the ledger`);
  }
  for (const file of files) {
    const fixture = JSON.parse(await readFile(`${directory}/${file}`, "utf8"));
    for (const key of ["source", "case", "url", "message", "request", "goObserved"]) {
      if (!(key in fixture)) throw new Error(`${file} is missing ${key}`);
    }
    if (!fixture.source.includes(`containrrr/shoutrrr ccf8139 pkg/services/${service}/`)) {
      throw new Error(`${file} must identify the pinned Go service source`);
    }
    for (const key of ["method", "url", "headers", "body"]) {
      if (!(key in fixture.request)) throw new Error(`${file} request is missing ${key}`);
      if (!isDeepStrictEqual(fixture.request[key], fixture.goObserved[key])) {
        throw new Error(`${file} request differs from its recorded Go observation`);
      }
    }
    if (fixture.captureAll && !isDeepStrictEqual(fixture.goObserved.requests?.map(
      ({ method, url, headers, body }) => ({ method, url, headers, body })), fixture.requests)) {
      throw new Error(`${file} request sequence differs from its recorded Go observation`);
    }
    const expectedOutcome = fixture.transportFailure ? "transport-error" :
      fixture.responseStatus >= 300 ? `http-status-${fixture.responseStatus}` :
      fixture.responseCode && fixture.responseCode !== 200 ? `api-code-${fixture.responseCode}` : "success";
    if (fixture.goObserved.outcome !== expectedOutcome) {
      throw new Error(`${file} lacks the expected Go outcome`);
    }
    const host = new URL(fixture.request.url).hostname;
    const fixedHosts = { join: "joinjoaomgcd.appspot.com", pushover: "api.pushover.net", pushbullet: "api.pushbullet.com" };
    if (!host.endsWith(".example.test") && host !== fixedHosts[service]) {
      throw new Error(`${file} must use a synthetic host or its upstream fixed endpoint`);
    }
    count++;
  }
}
console.log(`Compatibility metadata verified: ${stable.length}/19 stable services; ${count} Go observations.`);
