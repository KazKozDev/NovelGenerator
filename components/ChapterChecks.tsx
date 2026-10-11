import React, { useMemo } from 'react';
import { bestsellerAdvisory, hookScore, recurrentMotifs, rhythmDrift, uniqueNgramRatio } from '../utils/novel/analytics';

/**
 * Live coherence checks for the chapter under the cursor. Same measured
 * metrics as the old inspector column, recomputed as the prose streams in.
 * Advisory only — nothing here judges.
 */
interface ChapterChecksProps {
  content:string; chapterNum:number; revisionStatus?:string; targetWords?:number;
  texture?: {dialogueShare:number;medianParagraphWords:number;similesPer1000:number;taggedSpeechShare:number;findings:{id:string;description:string}[]} | null;
}
export default function ChapterChecks({ content, chapterNum, revisionStatus, texture, targetWords }: ChapterChecksProps) {
  const rows = useMemo(() => {
    if (!content.trim()) return undefined;
    const motifs = recurrentMotifs(content);
    const rhythm = rhythmDrift(content);
    const hook = hookScore(content);
    const advisory = bestsellerAdvisory(content).map(finding => finding.id);
    return [
      { label: 'Originality', value: `${Math.round(uniqueNgramRatio(content) * 100)}%` },
      {
        label: 'Motifs',
        value: motifs.length ? `${motifs.length} × “${motifs[0].phrase.slice(0, 32)}”` : 'none circling',
      },
      {
        label: 'Rhythm',
        value: rhythm.drifted ? `drifted ${rhythm.firstMedian}→${rhythm.lastMedian}w` : `held ~${rhythm.lastMedian}w`,
      },
      { label: 'Hook', value: `${hook}/10${advisory.length ? ` · ${advisory.join(', ')}` : ''}` },
    ];
  }, [content]);

  return (
    <div data-testid="zone-checks" className="shrink-0 flex flex-col pb-5">
      <div className="shrink-0 flex items-baseline justify-between pb-2">
        <h3 className="text-xs font-semibold uppercase text-zinc-500">Checks</h3>
        <span className="text-xs text-zinc-500">Ch #{chapterNum}</span>
      </div>
      {revisionStatus && <div className="pt-2 flex items-baseline justify-between gap-2 text-xs"><span className="uppercase text-zinc-500">Review</span><span className="text-zinc-400 text-right">{revisionStatus}</span></div>}
      {rows ? (
        <div className="pt-2 pr-1 flex flex-col gap-3">
          {rows.map(row => (
            <div key={row.label} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="uppercase text-zinc-500 shrink-0">{row.label}</span>
              <span className="text-zinc-300 truncate text-right" title={row.value}>{row.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="pt-3 text-zinc-500 text-xs">
          <span>Awaiting prose...</span>
        </div>
      )}
      {texture && <section data-testid="checks-measured" className="mt-4 pt-4 border-t border-zinc-800">
        <h4 className="text-xs font-semibold uppercase text-zinc-500 mb-3">Measured</h4>
        <div className="flex flex-col gap-3 pr-1">
          {[
            {label:'Words',value:(content.match(/\S+/gu)?.length || 0).toLocaleString()+(targetWords ? ` / ${targetWords.toLocaleString()}` : '')},
            {label:'Dialogue',value:`${Math.round(texture.dialogueShare*100)}%`},
            {label:'Median paragraph',value:`${texture.medianParagraphWords}w`},
            {label:'Comparisons/1k',value:texture.similesPer1000.toFixed(1)},
            {label:'Lines with a beat',value:`${Math.round(texture.taggedSpeechShare*100)}%`},
          ].map(row=><div key={row.label} className="flex items-baseline justify-between gap-2 text-xs"><span className="uppercase text-zinc-500 min-w-0">{row.label}</span><span className="text-zinc-300 tabular-nums shrink-0">{row.value}</span></div>)}
          {texture.findings.length>0&&<span className="text-xs text-zinc-400 break-words" title={texture.findings.map(finding=>finding.description).join('\n')}>{texture.findings.map(finding=>finding.id).join(' · ')}</span>}
        </div>
      </section>}
    </div>
  );
}
