import React, { useState } from 'react';
import { MarkdownView } from './common/MarkdownView';

const LABELS: Record<string, string> = {
  title: 'Title', summary: 'Summary', sceneBreakdown: 'Scenes',
  characterDevelopmentFocus: 'Character focus', plotAdvancement: 'Plot',
  timelineIndicators: 'Timeline', emotionalToneTension: 'Tone',
  connectionToNextChapter: 'Leads to', openingHook: 'Opens with', chapterEnding: 'Ends with',
  moralDilemma: 'Dilemma', consequencesOfChoices: 'Consequences', rhythmPacing: 'Pacing',
  tensionLevel: 'Tension', targetWordCount: 'Target words',
  centralConflict: 'Central conflict', protagonistChange: 'Protagonist change', endingPayoff: 'Ending payoff',
};

/** What the author checks while a chapter is being written; the rest is available on request. */
const DIGEST = ['summary', 'sceneBreakdown', 'chapterEnding'];

const readable = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map(item => typeof item === 'string' ? item.trim() : (typeof item === 'number' ? String(item) : (item as { sceneId?: string })?.sceneId))
      .filter(Boolean);
    return parts.length ? (parts as string[]).join(' · ') : undefined;
  }
  return undefined;
};

/** snake_case and camelCase keys become plain labels; known acronyms stay uppercase. */
const prettyLabel = (key: string): string => {
  if (LABELS[key]) return LABELS[key];
  if (key === 'pov_id') return 'POV';
  if (key === 'event_ids') return 'Events';
  return key
    .replace(/([A-Z])/g, ' $1')
    .split('_')
    .map(word => {
      const lower = word.toLowerCase();
      if (lower === 'pov') return 'POV';
      if (lower === 'id' || lower === 'ids') return 'IDs';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();
};

type Entry = { label: string; value: string };

const recordEntries = (record: Record<string, unknown>, order: string[] = []): Entry[] => {
  const keys = [...order.filter(key => key in record), ...Object.keys(record).filter(key => !order.includes(key))];
  return keys
    .map(key => ({ label: prettyLabel(key), value: readable(record[key]) || '' }))
    .filter(entry => Boolean(entry.value));
};

/** Chapter-map entries read best in decision order, with the chapter number as the heading. */
const CHAPTER_ORDER = ['function', 'main_change', 'setup_or_payoff', 'dependencies', 'event_ids', 'pov_id', 'target_words'];

/**
 * A plan is a set of decisions, not a data structure. Raw JSON puts braces and quotes between the
 * author and their own chapter, and the full record buries the few fields worth glancing at.
 */
export default function PlanView({ content, className = '' }: { content: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);

  let parsed: Record<string, unknown> | undefined;
  let listed: Record<string, unknown>[] | undefined;
  try {
    const value = JSON.parse(content);
    if (Array.isArray(value) && value.every(item => item && typeof item === 'object')) {
      listed = value as Record<string, unknown>[];
    } else if (value && typeof value === 'object') {
      parsed = value as Record<string, unknown>;
    }
  } catch { /* not JSON: it is prose, and prose renders as prose */ }

  // A chapter map is a list of per-chapter decisions: one readable card each,
  // decision order, chapter number as the heading. No braces reach the reader.
  if (listed?.length) {
    return (
      <div className={`${className} space-y-4`}>
        {listed.map((record, index) => {
          const chapter = readable(record.chapter);
          const entries = recordEntries(record, CHAPTER_ORDER).filter(entry => entry.label !== 'Chapter');
          if (!entries.length) return null;
          return (
            <section key={chapter || String(index)}>
              {chapter && <h4 className="text-xs font-semibold text-zinc-200">Chapter {chapter}</h4>}
              <dl className="mt-2 space-y-3">
                {entries.map(entry => (
                  <div key={entry.label}>
                    <dt className="text-xs font-semibold uppercase text-zinc-500">{entry.label}</dt>
                    <dd className="text-xs text-zinc-300 mt-1">{entry.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    );
  }

  if (!parsed) return <MarkdownView content={content} className={className} />;

  const all = Object.entries(parsed)
    .map(([key, value]) => ({ key, label: prettyLabel(key), value: readable(value) }))
    .filter((entry): entry is { key: string; label: string; value: string } => Boolean(entry.value));

  if (!all.length) return <MarkdownView content={content} className={className} />;

  const scenes = Array.isArray(parsed.detailedScenes)
    ? (parsed.detailedScenes as Record<string, unknown>[]).filter(scene => scene && typeof scene === 'object')
    : [];
  const digest = all.filter(entry => DIGEST.includes(entry.key) || entry.key === 'detailedScenes');
  const shown = (expanded || !digest.length ? all : digest).filter(entry => entry.key !== 'detailedScenes');
  const hidden = all.length - shown.length - (scenes.length ? 1 : 0);

  const sceneText = (scene: Record<string, unknown>, key: string): string | undefined => {
    const value = scene[key];
    if (typeof value === 'string') return value.trim() || undefined;
    if (Array.isArray(value)) {
      const parts = value.map(item => (typeof item === 'string' ? item : undefined)).filter(Boolean);
      return parts.length ? parts.join(', ') : undefined;
    }
    return undefined;
  };

  return (
    <div className={className}>
      <dl className="space-y-3">
        {shown.map(entry => (
          <div key={entry.key}>
            <dt className="text-xs font-semibold uppercase text-zinc-500">{entry.label}</dt>
            <dd className={`text-xs text-zinc-300 mt-1 ${!expanded && entry.key === 'summary' ? 'line-clamp-4' : ''}`}>
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>
      {scenes.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-semibold uppercase text-zinc-500">Scenes</div>
          {scenes.map((scene, index) => {
            const rows = [
              ['Shape', sceneText(scene, 'sceneShape')],
              ['Staging', sceneText(scene, 'staging')],
              ['Objective', sceneText(scene, 'objective')],
              ['Conflict', sceneText(scene, 'conflict')],
              ['Carried by', sceneText(scene, 'conflictCarriedBy')],
            ].filter((row): row is [string, string] => Boolean(row[1]));
            return (
              <div key={sceneText(scene, 'sceneId') || String(index)} className="border border-zinc-800 rounded p-2">
                <div className="text-xs font-semibold text-zinc-200">
                  {[sceneText(scene, 'sceneId'), sceneText(scene, 'location')].filter(Boolean).join(' · ')}
                  {sceneText(scene, 'participants') ? ` — ${sceneText(scene, 'participants')}` : ''}
                </div>
                {rows.map(([label, value]) => (
                  <div key={label} className="text-xs text-zinc-400 mt-1">
                    <span className="uppercase text-zinc-500">{label}: </span>
                    <span className="text-zinc-300">{value}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-xs uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Show full plan ({hidden} more)
        </button>
      )}
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-3 text-xs uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Show less
        </button>
      )}
    </div>
  );
}
