/**
 * Where each edition of the book stands on its way to a store: blocked by something the book lacks, ready to build,
 * built, checked the way the store checks it, or live in the store (the author says so; the app cannot see it).
 * A build remembers what it was made from, so an edit to the text, cover or recording sends it back to "ready".
 */
export type PublishGroup = 'ebook' | 'print' | 'audio' | 'video';
export type PublishStage = 'blocked' | 'ready' | 'built' | 'checked' | 'failed' | 'live';
export type CheckLevel = 'ok' | 'warn' | 'fail';
export interface PublishCheck { level: CheckLevel; text: string }

/** A finished build, kept with the book. `ok` is the store-style check: passed, refused, or not run (null). */
export interface BuildRecord { at: number; source: string; ok: boolean | null; note?: string; files: string[] }

export interface PlatformState {
  checks: PublishCheck[];
  /** What the edition would be built from now. */
  source: string;
  record?: BuildRecord;
  /** When the author marked it live in the store. */
  liveAt?: number;
}

/** A short, stable fingerprint of what an edition is made from. */
export function fingerprint(...parts: unknown[]): string {
  const text = parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p ?? null))).join('\u0001');
  let a = 5381, b = 52711;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = (a * 33) ^ c;
    b = (b * 33) ^ c;
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${text.length.toString(36)}`;
}

export function platformStage(p: PlatformState): { stage: PublishStage; note?: string } {
  const fresh = !!p.record && p.record.source === p.source;
  if (p.liveAt) return { stage: 'live', note: fresh || !p.record ? undefined : 'Changed since it went live: build and upload again' };
  const fail = p.checks.find(c => c.level === 'fail');
  if (fail) return { stage: 'blocked', note: fail.text };
  if (fresh) {
    if (p.record!.ok === false) return { stage: 'failed', note: p.record!.note || 'The built files did not pass the check' };
    return { stage: p.record!.ok ? 'checked' : 'built', note: p.record!.note };
  }
  return { stage: 'ready', note: p.record ? 'Changed since the last build' : undefined };
}

export interface PublishSummary {
  live: number;
  /** Built (and checked where the store checks) and waiting for the author's upload. */
  toUpload: number;
  toBuild: number;
  /** What stops the rest, each with the platforms it stops. */
  blockers: { note: string; names: string[]; firstId: string }[];
}

export function publishSummary(platforms: { id: string; name: string; stage: PublishStage; note?: string }[]): PublishSummary {
  const blockers = new Map<string, { names: string[]; firstId: string }>();
  for (const p of platforms) {
    if ((p.stage !== 'blocked' && p.stage !== 'failed') || !p.note) continue;
    const found = blockers.get(p.note);
    if (found) found.names.push(p.name);
    else blockers.set(p.note, { names: [p.name], firstId: p.id });
  }
  return {
    live: platforms.filter(p => p.stage === 'live').length,
    toUpload: platforms.filter(p => p.stage === 'built' || p.stage === 'checked').length,
    toBuild: platforms.filter(p => p.stage === 'ready').length,
    blockers: [...blockers].map(([note, b]) => ({ note, ...b })),
  };
}
