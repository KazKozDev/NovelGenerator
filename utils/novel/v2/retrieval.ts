import { paragraphsWithIds } from './tracker';
import type { ProjectStore } from './store';
import type { StoryState } from './types';

/**
 * Retrieval by reference (§5, "exact excerpts for returning to details").
 *
 * A scene that must call back to an earlier detail needs the paragraph that
 * established it, not a summary of the chapter it lived in. Paragraph ids are
 * scene-local (p1, p2, …), so a reference from another scene carries the scene
 * with it: CH02_S01#p3. A fact or event id (CH02_S01-e2, CH02_S01-q1) resolves
 * through the record's own evidence to the same paragraphs, which is how the
 * planner can cite something it only knows from memory.
 *
 * A reference that resolves to nothing is reported, never silently dropped: an
 * invented callback is exactly the failure this retrieval exists to prevent.
 */

const QUALIFIED = /^(CH\d+_S\d+)\s*[#:\-/]\s*(p\d+)$/i;
const RECORD_ID = /^(CH\d+_S\d+)-(?:e|q|t)\d+$/i;
const SCENE_CHAPTER = /^CH(\d+)_S\d+$/i;

/** No excerpt is worth the whole writing budget; a paragraph past this is cut with a mark. */
const MAX_CHARS = 900;
const MAX_EXCERPTS = 6;

function sceneParagraphs(sceneId: string, store: ProjectStore): { id: string; text: string }[] {
  const chapter = Number(sceneId.match(SCENE_CHAPTER)?.[1]);
  if (!Number.isFinite(chapter)) return [];
  const record = store.chapterScenes(chapter).find(item => item.id.toUpperCase() === sceneId.toUpperCase());
  return record?.prose ? paragraphsWithIds(record.prose) : [];
}

function clip(text: string): string {
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)} […]` : text;
}

export interface ResolvedSources {
  /** Ready for the writer's package: the paragraph verbatim under its own reference. */
  excerpts: string[];
  /** References no stored paragraph answers — a callback with nothing behind it. */
  missing: string[];
}

export function resolveSourceRefs(refs: unknown, store: ProjectStore, state: StoryState): ResolvedSources {
  const excerpts: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(refs) ? refs : []) {
    const ref = typeof raw === 'string' ? raw.trim() : '';
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    const targets: { scene: string; paragraph: string }[] = [];
    const qualified = ref.match(QUALIFIED);
    if (qualified) {
      targets.push({ scene: qualified[1], paragraph: qualified[2].toLowerCase() });
    } else if (RECORD_ID.test(ref)) {
      // A record cites the paragraphs that proved it; those paragraphs are the excerpt.
      const scene = ref.split('-')[0];
      const record = [...state.events, ...state.facts].find(item => item.id.toUpperCase() === ref.toUpperCase());
      for (const paragraph of record?.evidence_refs || []) {
        if (typeof paragraph === 'string' && /^p\d+$/i.test(paragraph.trim())) {
          targets.push({ scene, paragraph: paragraph.trim().toLowerCase() });
        }
      }
    }
    if (!targets.length) {
      missing.push(ref);
      continue;
    }
    let found = false;
    for (const target of targets) {
      const paragraph = sceneParagraphs(target.scene, store).find(item => item.id === target.paragraph);
      if (!paragraph) continue;
      found = true;
      if (excerpts.length < MAX_EXCERPTS) {
        excerpts.push(`[${target.scene}#${paragraph.id}] ${clip(paragraph.text)}`);
      }
    }
    if (!found) missing.push(ref);
  }
  return { excerpts, missing };
}
