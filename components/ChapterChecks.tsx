import React, { useMemo } from 'react';
import { bestsellerAdvisory, hookScore, recurrentMotifs, rhythmDrift, uniqueNgramRatio } from '../utils/novel/analytics';

/**
 * Live coherence and texture checks for the chapter under the cursor.
 * Same measured metrics as the inspector column, recomputed as prose streams in.
 * Restores full Motifs, Rhythm, and Measured Texture metrics.
 */
interface ChapterChecksProps {
  content: string;
  chapterNum: number;
  revisionStatus?: string;
  targetWords?: number;
  texture?: {
    dialogueShare: number;
    medianParagraphWords: number;
    similesPer1000: number;
    taggedSpeechShare: number;
    findings: { id: string; description: string }[];
  } | null;
}

export default function ChapterChecks({ content, chapterNum, revisionStatus, texture, targetWords }: ChapterChecksProps) {
  const wordCount = useMemo(() => (content.match(/\S+/gu)?.length || 0), [content]);

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

  const findings = useMemo(() => {
    if (!content.trim()) return [];
    const list: { id: string; description: string }[] = [];
    if (texture?.findings) {
      list.push(...texture.findings);
    }
    const advisory = bestsellerAdvisory(content);
    for (const adv of advisory) {
      if (!list.some(item => item.id === adv.id)) {
        list.push({ id: adv.id, description: adv.detail });
      }
    }
    return list;
  }, [content, texture]);

  return (
    <div data-testid="zone-checks" title="Text statistics and heuristic indicators, not a model review or plagiarism check." className="shrink-0 flex flex-col pb-5">
      {/* Header: Chapter title + status + word count */}
      <div className="shrink-0 flex flex-col gap-1.5 pb-2.5 border-b border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-zinc-200 whitespace-nowrap">
            Chapter {chapterNum}
          </h3>
          {content.trim() ? (
            <span className="text-xs font-mono tabular-nums text-zinc-400 whitespace-nowrap shrink-0">
              {wordCount.toLocaleString()} {targetWords ? `/ ${targetWords.toLocaleString()} ` : ''}words
            </span>
          ) : null}
        </div>
        {revisionStatus && (
          <div className="flex items-center">
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-zinc-400 font-medium whitespace-nowrap">
              {revisionStatus}
            </span>
          </div>
        )}
      </div>

      {rows ? (
        <div data-testid="checks-measured" className="pt-3 pr-1 flex flex-col gap-2.5">
          <div className="text-[11px] uppercase font-medium tracking-wider text-zinc-500">Live Checks</div>
          {rows.map(row => (
            <div key={row.label} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-zinc-500 shrink-0">{row.label}</span>
              <span className="text-zinc-300 font-mono truncate text-right" title={row.value}>{row.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="pt-3 text-zinc-500 text-xs">
          <span>Awaiting prose...</span>
        </div>
      )}

      {texture && (
        <section className="mt-4 pt-3 border-t border-zinc-800">
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2.5">Measured Texture</h4>
          <div className="flex flex-col gap-2 pr-1">
            {[
              { label: 'Words', value: (content.match(/\S+/gu)?.length || 0).toLocaleString() },
              { label: 'Dialogue', value: `${Math.round(texture.dialogueShare * 100)}%` },
              { label: 'Median paragraph', value: `${texture.medianParagraphWords}w` },
              { label: 'Comparisons/1k', value: texture.similesPer1000.toFixed(1) },
              { label: 'Lines with a beat', value: `${Math.round(texture.taggedSpeechShare * 100)}%` },
            ].map(row => (
              <div key={row.label} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-zinc-500 min-w-0">{row.label}</span>
                <span className="text-zinc-300 font-mono tabular-nums shrink-0">{row.value}</span>
              </div>
            ))}
            {findings.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {findings.map(finding => (
                  <span
                    key={finding.id}
                    className="text-xs px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/40 text-amber-300/90"
                    title={finding.description}
                  >
                    {finding.id}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
