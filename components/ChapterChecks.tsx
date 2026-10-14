import React, { useMemo } from 'react';
import { bestsellerAdvisory, hookScore, uniqueNgramRatio } from '../utils/novel/analytics';

/**
 * Live coherence and texture checks for the chapter under the cursor.
 * Recomputed as prose streams in. Compact and logically grouped.
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

  const stats = useMemo(() => {
    if (!content.trim()) return null;
    return {
      originality: `${Math.round(uniqueNgramRatio(content) * 100)}%`,
      hook: hookScore(content),
    };
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
        list.push(adv);
      }
    }
    return list;
  }, [content, texture]);

  return (
    <div data-testid="zone-checks" className="shrink-0 flex flex-col pb-4">
      {/* Header: Chapter title + status + word count */}
      <div className="shrink-0 flex items-center justify-between pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Chapter {chapterNum}</h3>
          {revisionStatus && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium truncate">
              {revisionStatus}
            </span>
          )}
        </div>
        {content.trim() ? (
          <span className="text-xs font-mono text-zinc-400 shrink-0">
            {wordCount.toLocaleString()} {targetWords ? `/ ${targetWords.toLocaleString()} ` : ''}words
          </span>
        ) : null}
      </div>

      {stats ? (
        <div data-testid="checks-measured" className="pt-2.5 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-baseline justify-between">
              <span className="text-zinc-500">Originality</span>
              <span className="text-zinc-300 font-mono">{stats.originality}</span>
            </div>

            {texture && (
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-500">Dialogue</span>
                <span className="text-zinc-300 font-mono">{Math.round(texture.dialogueShare * 100)}%</span>
              </div>
            )}

            {texture && (
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-500">Paragraphs</span>
                <span className="text-zinc-300 font-mono">{texture.medianParagraphWords}w</span>
              </div>
            )}

            {texture && (
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-500">Comparisons</span>
                <span className="text-zinc-300 font-mono">{texture.similesPer1000.toFixed(1)}</span>
              </div>
            )}

            <div className="flex items-baseline justify-between">
              <span className="text-zinc-500">Hook</span>
              <span className="text-zinc-300 font-mono">{stats.hook}/10</span>
            </div>
          </div>

          {findings.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {findings.map(finding => (
                <span
                  key={finding.id}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/40 text-amber-300/90"
                  title={finding.description}
                >
                  {finding.id}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="pt-2.5 text-zinc-500 text-xs">
          <span>Awaiting prose...</span>
        </div>
      )}
    </div>
  );
}
