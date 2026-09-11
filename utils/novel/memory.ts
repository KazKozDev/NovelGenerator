import type { ChapterAnalysis, ChapterRecord, ChapterVersion, NovelRun } from './contracts';
import { parseObject, stripThinking, type NovelLLM } from './review';
import { acceptedVersion } from './storyState';
import { sceneWordTargets } from './proseCraft';

/** One extraction, never a review or a repair. Failed extraction falls back to actual prose. */
export async function rememberChapter(chapter: ChapterRecord, version: ChapterVersion, llm: NovelLLM): Promise<ChapterAnalysis> {
  const base = { facts: [], events: [], promises: [], beats: [] };
  try {
    const raw = parseObject(await llm(`CHAPTER TEXT:\n${version.content}\nReturn JSON {"notes":[{"note":"a concise established event, location, possession, knowledge change or unresolved question","quote":"exact supporting passage"}]}. Up to 12 notes. Extract only from this text. Do not assess quality or invent missing events.`,
      'You record story memory from a written chapter. Return JSON only.', { route: 'writer', json: true, temperature: 0.1, maxTokens: 2048 }), ['notes']);
    const notes = (Array.isArray(raw.notes) ? raw.notes : []).filter((n: any) => typeof n.note === 'string' && typeof n.quote === 'string' && n.quote.trim().length >= 12 && version.content.includes(n.quote)).slice(0, 12);
    if (!notes.length) throw new Error('No grounded memory notes');
    return { ...base, summary: notes.map((n: any) => n.note.slice(0, 500)).join('\n'), events: notes.map((n: any, i: number) => ({ id: `ch${chapter.number}-r${version.revision}-${i}`, description: n.note.slice(0, 500), consequences: [], evidence: { chapter: chapter.number, revision: version.revision, quote: n.quote } })) };
  } catch {
    return { ...base, summary: `Memory extraction unavailable. Source excerpts (not a summary):\n${version.content.slice(0, 1000)}\n[…]\n${version.content.slice(-2500)}` };
  }
}

/** Bounded context: recent grounded memory plus the previous chapter's actual ending. */
export function writingContext(run: NovelRun, chapter: ChapterRecord): string {
  const previous = run.chapters.filter(c => c.number < chapter.number).map(c => ({ number: c.number, version: acceptedVersion(c) })).filter(c => c.version);
  const memories = previous.map(c => ({ chapter: c.number, memory: c.version!.analysis?.summary || c.version!.content.slice(-1800) }));
  return `STORY DESIGN (intent, not established events):\n${JSON.stringify({ conflict: run.blueprint?.centralConflict, change: run.blueprint?.protagonistChange, ending: run.blueprint?.endingPayoff, characters: run.blueprint?.characters })}\nEARLIER CHAPTER MEMORY:\n${JSON.stringify(memories.slice(-8)).slice(-20000)}\nPREVIOUS CHAPTER ENDING:\n${previous.at(-1)?.version?.content.slice(-3500) || 'This is the first chapter.'}`;
}

export async function writeDirect(run: NovelRun, chapter: ChapterRecord, llm: NovelLLM, sceneIndex?: number): Promise<string> {
  const scene = sceneIndex === undefined ? undefined : chapter.plan.detailedScenes[sceneIndex];
  const target = scene ? sceneWordTargets(chapter, run.spec.targetWordsPerChapter)[sceneIndex!] : run.spec.targetWordsPerChapter;
  const prompt = `Write chapter ${chapter.number}/${run.spec.chapterCount} in ${run.spec.language}, ${run.spec.tense} tense. Voice: ${run.spec.narrativeVoice}; tone: ${run.spec.tone}; audience: ${run.spec.targetAudience}; style: ${run.spec.writingStyle}; genre: ${run.spec.genre}.\n${writingContext(run, chapter)}\nPLAN (events to dramatize, not facts already established):\n${JSON.stringify(scene || chapter.plan)}\n${scene ? `SCENE ${sceneIndex! + 1}/${chapter.plan.detailedScenes.length}. Previously written scenes (source excerpts):\n${(chapter.sceneDrafts || []).map((text, i) => `Scene ${i + 1}: ${text.slice(0, 800)}\n[…]\n${text.slice(-2200)}`).join('\n').slice(-16000)}` : ''}\nWrite approximately ${target} words of finished prose. Dramatize goals, resistance, consequential choices and outcomes. Write dialogue when characters have something to say; no fixed dialogue quota. Continue from the actual text, avoid retelling earlier events, and stop at the planned outcome. Preserve established names, knowledge and physical conditions. Output prose only, without JSON, notes or scene labels.`;
  const text = stripThinking(await llm(prompt, 'You write the next part of a novel as finished prose.', { route: 'writer', temperature: 0.8, maxTokens: Math.max(4096, Math.ceil(target * 3)) }));
  if (!text.trim()) throw new Error(`Chapter ${chapter.number}: model returned empty prose. Retry to continue from the saved text.`);
  return text;
}
