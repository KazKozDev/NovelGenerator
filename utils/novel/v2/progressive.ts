import { fillTemplate } from '../prompts';
import develop_system from '../../../prompts/DEVELOP_SYSTEM.md?raw';
import develop_brief from '../../../prompts/DEVELOP_BRIEF.md?raw';
import develop_story from '../../../prompts/DEVELOP_STORY.md?raw';
import develop_chapter from '../../../prompts/DEVELOP_CHAPTER.md?raw';
import develop_audit from '../../../prompts/DEVELOP_AUDIT.md?raw';
import { structuredResponse, stripThinking, type NovelLLM } from './llm';
import type { ProjectStore } from './store';
import type { ProjectInput } from './types';

export type DraftPass = 'story' | 'scenes' | 'prose' | 'polish';
export interface DraftChapter { chapter: number; text: string }
export interface ProgressiveDraft {
  version: 1;
  input_key: string;
  plan: string;
  planning_source?: 'crystallized' | 'manifestation';
  versions: { pass: DraftPass; chapters: DraftChapter[]; revision_brief?: string; plan?: string }[];
  pending: { pass: DraftPass; brief: string; plan?: string; chapters: DraftChapter[] } | null;
  completed: boolean;
}
const passes: DraftPass[] = ['story', 'scenes', 'prose', 'polish'];
export const inputKey = (input: ProjectInput): string => JSON.stringify([input.premise, input.chapter_count, input.genre, input.target_total_words, input.author_requirements,...(input.planning_version?[input.planning_version]:[])]);

export function validateProgressive(value: unknown, input: ProjectInput): ProgressiveDraft {
  const draft = value as ProgressiveDraft;
  const validChapters = (items: DraftChapter[], complete: boolean): boolean => Array.isArray(items)
    && (!complete || items.length === input.chapter_count)
    && items.every((item, index) => item.chapter === index + 1 && typeof item.text === 'string' && !!item.text.trim());
  if (Array.isArray(draft?.versions) && draft.versions.some(v => Array.isArray(v.chapters) && !validChapters(v.chapters, true))) {
    throw new Error(`Progressive draft is malformed: every complete version must contain exactly ${input.chapter_count} nonempty chapters numbered consecutively.`);
  }
  if (!draft || draft.version !== 1 || draft.input_key !== inputKey(input) || typeof draft.plan !== 'string' || !draft.plan.trim()
    || !Array.isArray(draft.versions) || draft.versions.length > passes.length
    || draft.versions.some((v, i) => v.pass !== passes[i] || !validChapters(v.chapters, true)
      || (v.plan !== undefined && (typeof v.plan !== 'string' || !v.plan.trim())))
    || typeof draft.completed !== 'boolean' || draft.completed !== (draft.versions.length === passes.length)
    || (draft.pending !== null && !draft.pending)
    || (draft.pending && (draft.completed || draft.pending.pass !== passes[draft.versions.length] || typeof draft.pending.brief !== 'string'
      || (draft.pending.plan !== undefined && (typeof draft.pending.plan !== 'string' || !draft.pending.plan.trim()))
      || !validChapters(draft.pending.chapters, false) || draft.pending.chapters.length > input.chapter_count))) {
    throw new Error('Progressive draft is malformed or belongs to a different book.');
  }
  return draft;
}

/** Keep structured model plans intact rather than demanding a prose-string envelope. */
export function readProgressivePlan(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length) {
    return JSON.stringify(raw);
  }
  throw new Error('A revision must include a nonempty updated plan as text or a JSON object.');
}

function readRevision(raw: any): { plan: string; brief: string } {
  const plan = readProgressivePlan(raw.plan);
  if (typeof raw.brief !== 'string' || !raw.brief.trim()) {
    throw new Error('A revision must include a concrete brief.');
  }
  return { plan, brief: raw.brief };
}

const system = fillTemplate('DEVELOP_SYSTEM', develop_system, {  });
const bookText = (chapters: DraftChapter[]): string => chapters.map(c => `CHAPTER ${c.chapter}\n${c.text}`).join('\n\n');

/** Each published version contains the entire story. Pending chapter rewrites never leak into it. */
export async function developBook(input: ProjectInput, store: ProjectStore, llm: NovelLLM,
  progress: (stage: 'design' | 'chapter' | 'audit' | 'done', chapter?: number) => void): Promise<void> {
  const requirements = JSON.stringify(input);
  let draft = store.loadProgressive();
  if (draft) validateProgressive(draft, input);
  else {
    progress('design');
    // This seed is the author's request, not a separately generated or approved plan.
    // The first model call must already produce the entire story through its ending.
    const plan = `Author's undeveloped book intention: ${input.premise}\nRequirements: ${input.author_requirements}`;
    draft = { version: 1, input_key: inputKey(input), plan, planning_source: 'manifestation', versions: [], pending: null, completed: false };
    store.saveProgressive(draft);
  }
  for (const pass of passes.slice(draft.versions.length)) {
    store.log('development', `Developing the whole book: ${pass}. Causal changes are allowed.`);
    progress(pass === 'polish' ? 'audit' : 'design');
    const previous = draft.versions.at(-1)?.chapters || [];
    if (!draft.pending) {
      const revision = pass === 'story' ? { plan: draft.plan, brief: draft.plan } : await structuredResponse(
        fillTemplate('DEVELOP_BRIEF', develop_brief, { author_request: requirements, plan: draft.plan, previous_book: bookText(previous), pass }),
        system, llm, ['plan', 'brief', 'clarifications'], raw => {
          const revision = readRevision(raw);
          if (!Array.isArray(raw.clarifications) || raw.clarifications.some((item: any) =>
            typeof item?.unclear !== 'string' || !item.unclear.trim() || typeof item.resolution !== 'string' || !item.resolution.trim()
            || !Array.isArray(item.chapters) || !item.chapters.length || item.chapters.some((ch: any) => !Number.isInteger(ch) || ch < 1 || ch > input.chapter_count))) {
            throw new Error('Clarifications must name a concrete uncertainty, its resolution and affected chapters.');
          }
          return { ...revision, brief: `${revision.brief}\nConcrete clarifications:\n${JSON.stringify(raw.clarifications)}` };
        },
        { route: 'validator', stage: `develop-${pass}-brief`, maxTokens: 8192, deliberate: true });
      draft = { ...draft, pending: { pass, brief: revision.brief, plan: revision.plan, chapters: [] } };
      store.saveProgressive(draft);
    }
    if (pass === 'story' && draft.pending!.chapters.length !== input.chapter_count) {
      const rough = await structuredResponse(fillTemplate('DEVELOP_STORY', develop_story, { author_request: String(requirements), plan: String(draft.pending!.plan || draft.plan), chapter_count: String(input.chapter_count), target_words: String(Math.min(2400, Math.max(500, Math.round(input.target_total_words * 0.15)))) }), system, llm, ['chapters', 'plan'], raw => {
        const { plan } = readRevision({ plan: raw.plan, brief: 'story' });
        const probe = { ...draft!, versions: [{ pass: 'story' as const, chapters: raw.chapters }], pending: null, completed: false };
        validateProgressive(probe, input);
        return { chapters: raw.chapters as DraftChapter[], plan };
      }, { route: 'writer', stage: 'develop-story', temperature: 0.8, maxTokens: 16384 });
      draft = { ...draft, pending: { ...draft.pending!, chapters: rough.chapters, plan: rough.plan } };
      store.saveProgressive(draft);
    } else {
      for (let chapter = draft.pending!.chapters.length + 1; chapter <= input.chapter_count; chapter++) {
        progress('chapter', chapter);
        const target = Math.round(input.target_total_words / input.chapter_count * (pass === 'scenes' ? 0.45 : 1));
        const text = stripThinking(await llm(fillTemplate('DEVELOP_CHAPTER', develop_chapter, { author_request: String(requirements), pass: String(pass), plan: draft.pending!.plan || draft.plan, revision_brief: String(draft.pending!.brief), previous_book: String(bookText(previous)), revised_chapters: String(bookText(draft.pending!.chapters)), chapter: String(chapter), target_words: String(target), pass_instruction: String(pass === 'polish' ? 'Resolve remaining ambiguity, contradictions and repetition; retain strong existing passages. Cut passages that only repeat what is already clear.' : pass === 'scenes' ? 'Make unclear motives, choices, resistance and causal transitions visible as events and consequences. Do not add complications just to lengthen the story.' : 'Give the established scenes full dialogue, action and precise language. Reveal what earlier drafts only summarized. Do not grow exposition, weather or procedural detail to fill a word quota.') }), system,
          { route: 'writer', stage: `develop-${pass}`, temperature: pass === 'polish' ? 0.4 : 0.8, maxTokens: Math.max(8192, Math.ceil(target * 2.8)) }));
        if (!text.trim()) throw new Error(`Empty chapter ${chapter} in ${pass}.`);
        draft = { ...draft, pending: { ...draft.pending!, chapters: [...draft.pending!.chapters, { chapter, text }] } };
        store.saveProgressive(draft);
      }
    }
    const chapters = draft.pending!.chapters;
    const plan = draft.pending!.plan || draft.plan;
    draft = { ...draft, plan, versions: [...draft.versions, { pass, chapters, plan, revision_brief: draft.pending!.brief }], pending: null, completed: pass === 'polish' };
    store.saveProgressive(draft);
    for (const item of chapters) store.saveManuscript(item.chapter, item.text);
    store.checkpoint(`develop-${pass}`);
    store.log('development', `Complete ${pass} version saved: ${chapters.length} chapters.`);
  }
  // Reconcile the manuscript cache after interrupted persistence between draft and chapter writes.
  for (const item of draft.versions.at(-1)!.chapters) store.saveManuscript(item.chapter, item.text);
  if (!store.loadReport()) {
    progress('audit');
    const audit = await structuredResponse(fillTemplate('DEVELOP_AUDIT', develop_audit, { author_request: String(requirements), final_book: String(bookText(draft.versions.at(-1)!.chapters)) }), system, llm, ['summary', 'supported', 'findings'], raw => {
      if (typeof raw.summary !== 'string' || typeof raw.supported !== 'boolean' || !Array.isArray(raw.findings)
        || raw.findings.some((f: any) => !['major', 'minor'].includes(f.severity) || typeof f.description !== 'string')) throw new Error('Malformed whole-book audit.');
      return raw as { summary: string; supported: boolean; findings: { severity: string; description: string }[] };
    }, { stage: 'develop-audit', route: 'validator', maxTokens: 8192, deliberate: true });
    store.saveReport({ coverage: { material_examined: 'Entire final progressive manuscript', limitations: ['Literary and causal assessment by a model; no external fact verification.'] },
      findings: audit.findings.map(f => ({ ...f, category: 'whole-book', evidence_refs: [], reader_impact: f.description, certainty: 'model assessment' })),
      central_resolution: { supported: audit.supported, evidence_refs: [], comment: audit.summary }, unresolved_major_promises: [], need_more_evidence: [],
      summary: audit.summary, status: !audit.supported || audit.findings.length ? 'COMPLETE_WITH_WARNINGS' : 'COMPLETE' });
  }
  progress('done');
}
