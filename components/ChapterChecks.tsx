import React, { useMemo } from 'react';
import { recurrentMotifs, rhythmDrift } from '../utils/novel/coherence';
import { bestsellerAdvisory, hookScore, uniqueNgramRatio } from '../utils/novel/diversity';

/**
 * Live coherence checks for the chapter under the cursor. Same measured
 * metrics as CoherencePanel, but compact rows for the inspector column and
 * recomputed as the prose streams in. Advisory only — nothing here judges.
 */
export default function ChapterChecks({ content, chapterNum }: { content: string; chapterNum: number }) {
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
    </div>
  );
}
