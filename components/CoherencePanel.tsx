import React, { useMemo } from 'react';
import { recurrentMotifs, rhythmDrift } from '../utils/novel/coherence';
import { bestsellerAdvisory, hookScore, uniqueNgramRatio } from '../utils/novel/diversity';

/**
 * Advisory coherence metrics for a finished manuscript. Every number here
 * is measured, not judged: motifs counted, rhythm compared, hooks scored.
 * Nothing blocks on these — they tell the author where to look.
 */
export default function CoherencePanel({ content }: { content: string }) {
  const metrics = useMemo(() => {
    if (!content.trim()) return undefined;
    const motifs = recurrentMotifs(content);
    const rhythm = rhythmDrift(content);
    const advisory = bestsellerAdvisory(content);
    return {
      originality: Math.round(uniqueNgramRatio(content) * 100),
      motifs,
      rhythm,
      hook: hookScore(content),
      advisory: advisory.map(finding => finding.id),
    };
  }, [content]);

  if (!metrics) return null;

  const cards: { label: string; value: string; hint: string }[] = [
    {
      label: 'Phrasing originality',
      value: `${metrics.originality}%`,
      hint: 'Share of unique 4-grams; higher means less formulaic phrasing',
    },
    {
      label: 'Recurrent motifs',
      value: String(metrics.motifs.length),
      hint: metrics.motifs.length
        ? `Most circled: “${metrics.motifs[0].phrase}” in ${metrics.motifs[0].sentences} sentences`
        : 'No phrase circles three or more sentences',
    },
    {
      label: 'Closing rhythm',
      value: metrics.rhythm.drifted ? 'Drifted' : 'Held',
      hint: `Opening median ${metrics.rhythm.firstMedian} words vs closing ${metrics.rhythm.lastMedian}`,
    },
    {
      label: 'Opening hook',
      value: `${metrics.hook}/10`,
      hint: metrics.advisory.length
        ? `Advisory: ${metrics.advisory.join(', ')}`
        : 'Opens through action, conflict or a question',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map(card => (
        <div key={card.label} className="bg-zinc-900 border border-zinc-800 p-4 rounded">
          <div className="text-zinc-400 text-xs uppercase mb-1">{card.label}</div>
          <div className="text-zinc-100 text-lg font-semibold">{card.value}</div>
          <div className="text-zinc-500 text-xs mt-1">{card.hint}</div>
        </div>
      ))}
    </div>
  );
}
