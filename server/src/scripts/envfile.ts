import { readFileSync, writeFileSync } from "node:fs";

export const ENV_PATH = new URL("../../../.env", import.meta.url).pathname;

/** Set KEY=value in the repo-root .env (adds the line if missing). */
export function setEnvVar(key: string, value: string) {
  const env = readFileSync(ENV_PATH, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(ENV_PATH, re.test(env) ? env.replace(re, `${key}=${value}`) : `${env.trimEnd()}\n${key}=${value}\n`);
  process.env[key] = value;
}
