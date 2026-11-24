import React from 'react';
import PlatformLogo from '../PlatformLogo';
import type { PublishCheck, PublishGroup, PublishStage } from '../../utils/publish/publishStatus';
import type { Disclosure } from '../../utils/publish/disclosures';

/** One edition on the Publish stage, as each group's hook describes it. */
export interface PublishPlatform {
  /** Unique on the page: "<group>:<store id>". */
  key: string;
  /** The store's own id, for its logo. */
  id: string;
  group: PublishGroup;
  name: string;
  where: string;
  /** The files in one line: "EPUB 3 · cover JPEG 1600×2560". */
  spec: string;
  checks: PublishCheck[];
  stage: PublishStage;
  note?: string;
  liveAt?: number;
  setLive: (at: number | undefined) => void;
  busy?: { label: string; share?: number };
  error?: string;
  /** Saved files, as paths from Documents. */
  files: string[];
  build: () => Promise<void>;
  actionLabel: string;
  /** Why the action cannot run now though the edition is not blocked (a finished build that needs its input again). */
  cannotBuild?: string;
  /** Controls and results only this platform has: a spine width, measured audio files, EPUBCheck messages. */
  details?: React.ReactNode;
  /** What to tell the store about AI, and where. */
  disclosures?: Disclosure[];
  steps: string[];
}

export const Dot: React.FC<{ level: PublishCheck['level'] }> = ({ level }) => (
  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${level === 'ok' ? 'bg-emerald-500' : level === 'warn' ? 'bg-amber-400' : 'bg-red-500'}`} aria-hidden="true" />
);

// The studio vocabulary the Cover stage set.
// Secondary actions are outlined, not filled: a page of dark filled buttons reads as a wall of black blocks.
const button = 'px-3 py-1.5 text-xs rounded bg-transparent hover:bg-zinc-800/70 border border-zinc-700 text-zinc-300 hover:text-zinc-100 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';
const primary = 'px-3 py-1.5 text-xs rounded bg-zinc-500 hover:bg-zinc-600 text-white font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-500';

const STEPS: { stage: PublishStage; label: string }[] = [
  { stage: 'ready', label: 'Ready' },
  { stage: 'built', label: 'Built' },
  { stage: 'checked', label: 'Checked' },
  { stage: 'live', label: 'Live' },
];
const ORDER: Record<PublishStage, number> = { blocked: -1, ready: 0, built: 1, failed: 1, checked: 2, live: 3 };

/** Ready · Built · Checked · Live as the studio's mono chips, lit up to where the edition is; a refused check shows red. */
function Stepper({ stage }: { stage: PublishStage }) {
  const at = ORDER[stage];
  return (
    <ol className="hidden md:flex items-center gap-1" aria-label={`Stage: ${stage}`}>
      {STEPS.map((s, i) => {
        const failedHere = stage === 'failed' && s.stage === 'checked';
        const done = i <= at;
        return (
          <li key={s.stage} className="flex items-center gap-1">
            {i > 0 && <span className={`h-px w-2 ${done || failedHere ? 'bg-zinc-600' : 'bg-zinc-800'}`} />}
            <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
              failedHere ? 'bg-red-950/60 text-red-300 border-red-800/60'
                : done ? (s.stage === 'live' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' : 'border-zinc-500 text-zinc-200')
                  : 'border-zinc-800 text-zinc-600'
            }`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const noteColor: Record<PublishStage, string> = {
  blocked: 'text-red-300', failed: 'text-red-300', ready: 'text-zinc-500', built: 'text-amber-300', checked: 'text-emerald-300', live: 'text-amber-300',
};

export default function PlatformRow({ p, open, onToggle }: { p: PublishPlatform; open: boolean; onToggle: () => void }) {
  const canBuild = p.stage !== 'blocked' && !p.busy && !p.cannotBuild;
  const label = p.busy ? `${p.busy.label}${p.busy.share !== undefined ? ` ${Math.round(p.busy.share * 100)}%` : ''}` : p.files.length ? `${p.actionLabel} again` : p.actionLabel;
  const shown = p.error || p.note || (p.stage === 'checked' ? 'Ready to upload' : p.stage === 'live' && p.liveAt ? `Live since ${new Date(p.liveAt).toLocaleDateString()}` : '');
  return (
    <li id={`publish-${p.key}`} className={`border-t border-zinc-800 first:border-t-0 ${open ? 'bg-zinc-800/30' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-[14rem] flex-1 items-center gap-3 text-left">
          <PlatformLogo id={p.id} className="h-7 w-7" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-zinc-100" title={p.where}>{p.name} <span className="font-normal text-zinc-500">· {p.where}</span></span>
            <span className="block truncate font-mono text-[11px] text-zinc-500">{p.spec}</span>
          </span>
        </button>
        <Stepper stage={p.stage} />
        <span className={`w-full truncate text-[11px] lg:w-64 ${p.error ? 'text-red-300' : noteColor[p.stage]}`} title={shown}>{shown}</span>
        <button
          type="button"
          onClick={() => void p.build()}
          disabled={!canBuild}
          title={p.cannotBuild}
          aria-label={`${p.actionLabel} for ${p.name}`}
          className={`min-w-[7.5rem] ${p.stage === 'ready' ? primary : button}`}
        >
          {label}
        </button>
        <button type="button" onClick={onToggle} aria-label={open ? 'Hide details' : 'Show details'} className="w-5 text-xs text-zinc-500 hover:text-zinc-200">
          <span aria-hidden>{open ? '▾' : '▸'}</span>
        </button>
      </div>
      {p.busy && (
        <div className="mx-4 mb-2 h-0.5 overflow-hidden rounded bg-zinc-800">
          <div className={`h-full bg-zinc-300 transition-all ${p.busy.share === undefined ? 'w-1/3 animate-pulse' : ''}`} style={p.busy.share !== undefined ? { width: `${p.busy.share * 100}%` } : undefined} />
        </div>
      )}
      {open && (
        <div className="grid gap-4 border-t border-zinc-800 bg-zinc-800/25 px-4 py-3 pl-[3.75rem] md:grid-cols-2">
          <div className="space-y-3">
            <ul className="space-y-1 text-[11px] text-zinc-400">
              {p.checks.map(c => <li key={c.text} className="flex gap-2"><Dot level={c.level} /><span>{c.text}</span></li>)}
            </ul>
            {p.details}
          </div>
          <div className="space-y-3">
            {p.files.length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-emerald-400/90">
                {p.files.map(path => <li key={path} className="truncate" title={path}>✓ {path.split('/').slice(-2).join('/')}</li>)}
              </ul>
            )}
            {p.disclosures && p.disclosures.length > 0 && (
              <div className="text-[11px]">
                <p className="mb-1 font-medium uppercase tracking-wider text-zinc-500">Disclose</p>
                <ul className="space-y-1">
                  {p.disclosures.map(d => (
                    <li key={d.where + d.text} className="flex items-start gap-2 text-zinc-300">
                      <span className="shrink-0 text-zinc-500">{d.where}:</span>
                      <span className="min-w-0 flex-1">{d.text}</span>
                      {d.paste && <button type="button" className="shrink-0 text-zinc-500 hover:text-zinc-200" onClick={() => void navigator.clipboard?.writeText(d.text)}>Copy</button>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-[11px] text-zinc-500">
              <p className="mb-1 font-medium uppercase tracking-wider text-zinc-500">How to upload</p>
              <ol className="list-decimal space-y-0.5 pl-4">{p.steps.map(step => <li key={step}>{step}</li>)}</ol>
            </div>
            {(p.stage === 'built' || p.stage === 'checked' || p.stage === 'live') && (
              <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                <input type="checkbox" checked={!!p.liveAt} onChange={e => p.setLive(e.target.checked ? Date.now() : undefined)} />
                Uploaded and live in {p.name}
              </label>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
