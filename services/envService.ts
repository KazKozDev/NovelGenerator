import { existsSync, readFileSync } from 'node:fs';

/** Reads a configuration key from process.env or .env.local without exposing credentials to the client. */
export function readEnvSetting(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env.local')) return undefined;
  const line = readFileSync('.env.local', 'utf8').split('\n').find(item => item.trimStart().startsWith(`${name}=`));
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') || undefined;
}
