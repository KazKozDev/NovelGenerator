import type { ChapterAnalysis, ChapterRecord, ChapterVersion, Evidence, NovelRun, ReviewIssue, ReviewReport } from './contracts';
import { specPrompt } from './contracts';
import { acceptedVersion, canonBefore, canonForPrompt, endingIssues, evidenceExists, validateAnalysis } from './storyState';

export type NovelLLMRoute = 'writer' | 'validator';
export type NovelLLM = (prompt: string, system: string, options?: { json?: boolean; schema?: object; temperature?: number; maxTokens?: number; route?: NovelLLMRoute }) => Promise<string>;

export function stripThinking(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (/<think>/i.test(cleaned)) throw new Error('The model response ended inside a thinking block.');
  const closing = cleaned.toLowerCase().lastIndexOf('</think>');
  if (closing !== -1) cleaned = cleaned.slice(closing + 8);
  return cleaned.trim();
}

/** Accept formatting wrappers, never synthesize missing JSON values or choose a sample silently. */
export function parseObject(text: string, requiredKeys: string[] = []): any {
  const cleaned = stripThinking(text);
  const candidates: string[] = [cleaned];
  for (const block of cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) candidates.push(block[1].trim());
  let start = -1, depth = 0;
  let inString = false, escaped = false;
  for (let index = 0; index < cleaned.length; index++) {
    const char = cleaned[index];
    if (depth === 0) {
      if (char === '{') { start = index; depth = 1; }
      continue;
    }
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && inString) { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) candidates.push(cleaned.slice(start, index + 1));
  }
  const objects = new Map<string, any>();
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value) && requiredKeys.every(key => Object.hasOwn(value, key))) {
        objects.set(JSON.stringify(value), value);
      }
    } catch { /* A malformed candidate is not usable data. */ }
  }
  if (objects.size !== 1) throw new Error(objects.size ? 'Ambiguous response: multiple JSON objects match the expected contract.' : 'Expected a complete JSON object.');
  return [...objects.values()][0];
}

export async function structuredResponse<T>(prompt: string, system: string, llm: NovelLLM, keys: string[], decode: (raw: any) => T, options: { temperature?: number; maxTokens?: number; schema?: object; route?: NovelLLMRoute } = {}): Promise<T> {
  let failure = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const schema = options.schema || { type: 'object', required: keys, properties: Object.fromEntries(keys.map(key => [key, {}])), additionalProperties: true };
      const raw = await llm(`${prompt}${failure ? `\nThe previous response could not be validated: ${failure}. Return the complete corrected JSON. Never replace missing data with placeholders.` : ''}`, system, { json: true, schema, temperature: attempt ? 0.1 : options.temperature ?? 0.2, maxTokens: options.maxTokens ?? 16384, route: options.route ?? 'validator' });
      return decode(parseObject(raw, keys));
    } catch (error) { failure = String(error); }
  }
  throw new Error(`Structured response remained unvalidated after two attempts: ${failure}`);
}

export async function generateProse(llm: NovelLLM, prompt: string, system: string, options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
  return structuredResponse(`${prompt}\nOUTPUT FORMAT: Return one JSON object with exactly the field "prose", containing the complete final literary prose as a string. Do not put planning, notes, commentary or reasoning inside prose.`, system, llm, ['prose'], raw => {
    if (typeof raw.prose !== 'string' || !raw.prose.trim()) throw new Error('Missing final prose.');
    if (/<\/?think>/i.test(raw.prose)) throw new Error('Thinking markup remains inside final prose.');
    return raw.prose.trim();
  }, { ...options, route: 'writer', schema: { type: 'object', required: ['prose'], properties: { prose: { type: 'string' } }, additionalProperties: false } });
}

const categories = ['canon', 'knowledge', 'plot', 'character', 'dialogue', 'voice', 'pacing', 'hook', 'ending', 'audience', 'format'];
const evidenceSchema = { type: 'object', required: ['chapter', 'revision', 'quote'], properties: { chapter: { type: 'integer' }, revision: { type: 'integer' }, quote: { type: 'string' } }, additionalProperties: false };
const issueSchema = { type: 'object', required: ['issues'], properties: { issues: { type: 'array', items: { type: 'object', required: ['id', 'category', 'severity', 'description', 'instruction', 'evidence'], properties: { id: { type: 'string' }, category: { type: 'string', enum: categories }, severity: { type: 'string', enum: ['critical', 'major', 'minor'] }, description: { type: 'string' }, instruction: { type: 'string' }, evidence: { type: 'array', minItems: 1, items: evidenceSchema } }, additionalProperties: false } } }, additionalProperties: false };
const issueFormat = `Return JSON {"issues":[{"id":"unique-id","category":"canon|knowledge|plot|character|dialogue|voice|pacing|hook|ending|audience|format","severity":"critical|major|minor","description":"specific problem","instruction":"targeted repair preserving other content","evidence":[{"chapter":1,"revision":1,"quote":"EXACT substring of the prose shown to you"}]}]}. An empty issues array means no actionable issues. Keep the report concise: report the most important actionable defects, with short exact quotations, not an essay or a restatement of the chapter. The application locates each quotation itself, so the quote must be exact; chapter and revision are only hints. Every issue must cite at least one exact prose passage; for an omission cite the relevant passage where it should be established. Do not invent quotations; a quotation must be continuous prose copied from the version under review, shortened only at its ends. Do not rate prose by whether an API call succeeded.`;

/**
 * One sloppy paraphrase must not void an otherwise evidenced report, and must not be repaired either:
 * unverifiable citations are dropped, an issue left without evidence is discarded and counted.
 */
function parseIssues(value: any, sources: { chapter: number; version: ChapterVersion }[]): { issues: ReviewIssue[]; discarded: number } {
  if (!Array.isArray(value?.issues)) throw new Error('Review did not return issues.');
  const ids = new Set<string>();
  const issues: ReviewIssue[] = [];
  let discarded = 0;
  value.issues.forEach((raw: any, index: number) => {
    if (!raw || typeof raw !== 'object') throw new Error('Malformed editorial issue.');
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `issue-${index + 1}`;
    const category = typeof raw.category === 'string' ? raw.category.toLowerCase().trim() : '';
    const severity = typeof raw.severity === 'string' ? raw.severity.toLowerCase().trim() : '';
    const description = raw.description ?? raw.issue;
    const instruction = raw.instruction ?? raw.fix;
    if (ids.has(id) || !categories.includes(category) || !['critical', 'major', 'minor'].includes(severity) ||
        typeof description !== 'string' || !description.trim() || description === '...' ||
        typeof instruction !== 'string' || !instruction.trim() || instruction === '...') throw new Error('Incomplete editorial issue.');
    ids.add(id);
    const cited = Array.isArray(raw.evidence) ? raw.evidence : raw.evidence && typeof raw.evidence === 'object' ? [raw.evidence] : [];
    // The application knows which prose it submitted: locate each quotation itself and stamp the true
    // chapter and revision. A model echoing the example's numbering must not void real evidence.
    const evidence: Evidence[] = [];
    for (const item of cited) {
      if (!item || typeof item.quote !== 'string') continue;
      const ordered = [...sources].sort((first, second) => Number(second.chapter === item.chapter) - Number(first.chapter === item.chapter));
      const source = ordered.find(candidate => evidenceExists({ chapter: candidate.chapter, revision: candidate.version.revision, quote: item.quote }, candidate.chapter, candidate.version));
      if (source) evidence.push({ chapter: source.chapter, revision: source.version.revision, quote: item.quote });
    }
    if (!evidence.length) { discarded++; return; }
    issues.push({ id, category, severity, description, instruction, evidence } as ReviewIssue);
  });
  return { issues, discarded };
}

/** Scripts a model may fall back into mid-sentence. Sampled review misses these; matching does not. */
const foreignScripts = [
  { name: 'CJK', pattern: /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/, languages: ['chinese', 'mandarin', 'cantonese', 'japanese', 'korean'] },
  { name: 'Arabic', pattern: /[\u0600-\u06ff]/, languages: ['arabic', 'persian', 'farsi', 'urdu'] },
  { name: 'Devanagari', pattern: /[\u0900-\u097f]/, languages: ['hindi', 'marathi', 'nepali', 'sanskrit'] },
  { name: 'Hebrew', pattern: /[\u0590-\u05ff]/, languages: ['hebrew', 'yiddish'] },
];

export function mechanicalIssues(chapter: number, version: ChapterVersion, language = ''): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const target = language.toLowerCase();
  for (const script of foreignScripts) {
    if (script.languages.some(name => target.includes(name))) continue;
    const found = script.pattern.exec(version.content);
    if (!found) continue;
    issues.push({
      id: `foreign-script-${script.name.toLowerCase()}`, category: 'format', severity: 'critical',
      description: `${script.name} characters appear inside prose written in ${language || 'the story language'}.`,
      instruction: `Replace every ${script.name} character with the intended wording in ${language || 'the story language'}, changing nothing else.`,
      evidence: [{ chapter, revision: version.revision, quote: version.content.slice(Math.max(0, found.index - 40), found.index + 40) }],
    });
  }
  const marker = version.content.match(/\[(?:DIALOGUE|ACTION|INTERNAL|DESCRIPTION|TRANSITION|EMOTION|SLOT)[A-Z_\d -]*\]/i);
  if (marker) issues.push({
    id: 'unfilled-slot', category: 'format', severity: 'critical',
    description: 'An unfilled generation slot remains in the prose.',
    instruction: 'Complete the missing passage using the scene plan and established facts.',
    evidence: [{ chapter, revision: version.revision, quote: marker[0] }],
  });
  return issues;
}

export async function reviewChapter(run: NovelRun, chapter: ChapterRecord, version: ChapterVersion, llm: NovelLLM): Promise<ReviewReport> {
  if (!version.content.trim()) return { validationVersion: 2, status: 'failed', checkedRevision: version.revision, issues: [], error: 'Chapter prose is empty.' };
  try {
    const previous = chapter.versions.find(item => item.revision === chapter.acceptedRevision);
    const prompt = `${specPrompt(run.spec)}\n\nREVIEW CHAPTER ${chapter.number}, REVISION ${version.revision}.\nPLAN (intent, not established fact):\n${JSON.stringify(chapter.plan)}\nACCEPTED CANON BEFORE THIS CHAPTER:\n${JSON.stringify(canonForPrompt(canonBefore(run, chapter.number)))}\nPLANNED PROMISES (the whole book's schedule):\n${JSON.stringify(run.blueprint?.promises || [])}\nSCHEDULED FOR THIS CHAPTER ONLY:\n${JSON.stringify((run.blueprint?.promises || []).filter(promise => promise.setupChapter === chapter.number || promise.payoffChapter === chapter.number))}\n${previous && previous.revision !== version.revision ? `PREVIOUS ACCEPTED VERSION (preserve its events, names, clues and outcome unless this revision explicitly targets them):\n${previous.content}\nREVISION PURPOSE: ${version.reason}\n` : ''}\nFULL CANDIDATE PROSE:\n${version.content}\n\nCheck causal plot advancement, central conflict (${run.blueprint?.centralConflict}), believable choices and consequences, knowledge acquisition (a character must not state or rely on a specific fact — a name, an event, a hidden detail — that the story has not yet given them; guessing, doubting, forming a wrong hypothesis, or reacting to something they directly perceive is not a violation, and neither is an action the character takes without certainty), distinct dialogue voices, POV/tense/style/audience, scene completeness, intentional pacing and emotional hooks. Check setup/payoff timing against the plan: report a missing setup or payoff only for a promise scheduled for this chapter. A promise whose payoff belongs to a later chapter must not be reported as unresolved here, and this chapter is not required to escalate or conclude it. The final chapter must fulfill the requested ending without a forced next-chapter hook. Flag only concrete defects, not universal stylistic preferences.\n${issueFormat}`;
    
    const report = await structuredResponse(prompt, 'You are a rigorous fiction continuity and developmental editor. Respond only with the requested JSON.', llm, ['issues'], raw => parseIssues(raw, [{ chapter: chapter.number, version }]), { schema: issueSchema });
    const issues = [...mechanicalIssues(chapter.number, version, run.spec.language), ...report.issues];
    const words = version.content.split(/\s+/).filter(Boolean).length;
    const target = chapter.plan.targetWordCount || run.spec.targetWordsPerChapter;
    if (words < target * 0.8) issues.push({
      id: 'incomplete-length', category: 'plot', severity: 'major',
      description: `Chapter contains ${words} words against a target of ${target}; it may be a synopsis or incomplete output.`,
      instruction: `Expand the chapter to at least ${Math.ceil(target * 0.8)} words by developing the planned scenes through action, dialogue, sensory detail, reflection and consequences; do not pad with repetition.`,
      evidence: [{ chapter: chapter.number, revision: version.revision, quote: version.content.slice(0, 200) }],
    });
    // A report whose only findings were unverifiable is not a clean chapter; never pass it silently.
    if (!issues.length && report.discarded) return { validationVersion: 2, status: 'not_checked', checkedRevision: version.revision, issues: [], error: `The review cited ${report.discarded} passage(s) that do not appear in this revision.` };
    return { validationVersion: 2, status: issues.some(issue => issue.severity !== 'minor') ? 'failed' : 'passed', checkedRevision: version.revision, issues };
  } catch (error) {
    return { validationVersion: 2, status: 'not_checked', checkedRevision: version.revision, issues: [], error: String(error) };
  }
}

export async function analyseChapter(run: NovelRun, chapter: ChapterRecord, version: ChapterVersion, llm: NovelLLM): Promise<ChapterAnalysis> {
  const passages = version.content.split(/\n\s*\n/).filter(text => text.trim()).map((text, index) => ({ sourceId: `p${index + 1}`, text }));
  const context = `${specPrompt(run.spec)}\nExtract only established information. Do not turn planned actions or predictions into completed events. Use concise, nonredundant entries.\nSOURCE PASSAGES (complete chapter=${chapter.number}, revision=${version.revision}):\n${JSON.stringify(passages)}\nReference the sourceId of an existing supporting passage in each evidence field. Do not copy quotations; the application resolves IDs to exact prose. Never invent a source or an event. An empty array is valid only when no relevant information is established.`;
  const schemas = {
    facts: '{"summary":"concise factual synopsis including the ending","facts":[{"id":"stable-id","subject":"name","predicate":"status/location/relationship:Name/belief/knowledge","value":"established value","knownBy":["name"],"evidence":{"sourceId":"p1"}}]}',
    events: '{"events":[{"id":"event-id","description":"actual choice or event","consequences":["established consequence"],"evidence":{"sourceId":"p1"}}]}',
    promises: '{"promises":[{"promiseId":"planned-id","kind":"setup|payoff","evidence":{"sourceId":"p1"}}]}',
  };
  const sourceEvidenceSchema = { type: 'object', required: ['sourceId'], properties: { sourceId: { type: 'string' } }, additionalProperties: false };
  const sectionSchemas = {
    facts: { type: 'object', required: ['summary', 'facts'], properties: { summary: { type: 'string' }, facts: { type: 'array', maxItems: 12, items: { type: 'object', required: ['id', 'subject', 'predicate', 'value', 'knownBy', 'evidence'], properties: { id: { type: 'string' }, subject: { type: 'string' }, predicate: { type: 'string' }, value: { type: 'string' }, knownBy: { type: 'array', items: { type: 'string' } }, evidence: sourceEvidenceSchema }, additionalProperties: false } } }, additionalProperties: false },
    events: { type: 'object', required: ['events'], properties: { events: { type: 'array', maxItems: 8, items: { type: 'object', required: ['id', 'description', 'consequences', 'evidence'], properties: { id: { type: 'string' }, description: { type: 'string' }, consequences: { type: 'array', items: { type: 'string' } }, evidence: sourceEvidenceSchema }, additionalProperties: false } } }, additionalProperties: false },
    promises: { type: 'object', required: ['promises'], properties: { promises: { type: 'array', items: { type: 'object', required: ['promiseId', 'kind', 'evidence'], properties: { promiseId: { type: 'string' }, kind: { type: 'string', enum: ['setup', 'payoff'] }, evidence: sourceEvidenceSchema }, additionalProperties: false } } }, additionalProperties: false },
  };
  // Separate bounded tasks avoid a single sprawling extraction. Nothing enters canon until all pass.
  const combined: ChapterAnalysis = { summary: '', facts: [], events: [], promises: [] };
  for (const field of ['facts', 'events', 'promises'] as const) {
    const extra = field === 'facts'
      ? 'Return at most 12 facts needed for later continuity. knownBy names only characters whose acquisition is supported by the passage.'
      : field === 'events'
        ? 'Return at most 8 consequential actions or choices. Describe intentions as intentions, not their future fulfillment.'
        : `Return only evidenced setup/payoff entries for the promises this chapter is scheduled to carry (at most one entry per ID and kind); a plan is not evidence of fulfillment. Record "setup" only for a promise whose setupChapter is ${chapter.number}, and "payoff" only for a promise whose payoffChapter is ${chapter.number}. A promise merely mentioned or advanced here, but scheduled elsewhere, gets no entry.\nSCHEDULED FOR THIS CHAPTER:\n${JSON.stringify((run.blueprint?.promises || []).filter(promise => promise.setupChapter === chapter.number || promise.payoffChapter === chapter.number))}`;
    const part = await structuredResponse(`${context}\nTASK: Extract ${field} only${field === 'facts' ? ', with a brief chapter synopsis' : ''}. ${extra}\nReturn JSON ${schemas[field]}`, 'You extract evidence from fiction, separating accepted events from intentions. Respond only with JSON.', llm, field === 'facts' ? ['summary', field] : [field], raw => {
      const items = structuredClone(raw[field]);
      if (!Array.isArray(items)) throw new Error('Chapter analysis is incomplete.');
      const limit = field === 'facts' ? 12 : field === 'events' ? 8 : (run.blueprint?.promises.length || 0) * 2;
      if (items.length > limit) throw new Error(`${field} exceeds the bounded extraction limit of ${limit}.`);
      for (const item of items) {
        const evidence = item?.evidence;
        if (evidence && Object.hasOwn(evidence, 'sourceId')) {
          if (Object.keys(evidence).length !== 1) throw new Error('Source reference must contain only sourceId.');
          const source = passages.find(passage => passage.sourceId === evidence.sourceId);
          if (!source) throw new Error(`Unknown evidence sourceId: ${String(evidence.sourceId)}`);
          item.evidence = { chapter: chapter.number, revision: version.revision, quote: source.text };
        }
      }
      // Empty sibling fields serve only to validate this section, never as fallback canon.
      const knownPromiseIds = new Set(run.blueprint?.promises.map(promise => promise.id) || []);
      // Unknown promise IDs cannot establish canon. Dropping them is fail-closed:
      // endingIssues still blocks the book when any required known promise is missing.
      // The schedule is the application's own plan: a label that contradicts it cannot establish canon.
      const scheduled = new Map((run.blueprint?.promises || []).map(promise => [promise.id, promise]));
      const validatedItems = field === 'promises'
        ? items.filter(item => {
            const promise = knownPromiseIds.has(item.promiseId) ? scheduled.get(item.promiseId) : undefined;
            if (!promise) return false;
            return item.kind === 'setup' ? promise.setupChapter === chapter.number : promise.payoffChapter === chapter.number;
          })
        : items;
      const section: ChapterAnalysis = { summary: field === 'facts' ? raw.summary : 'section validation', facts: [], events: [], promises: [], [field]: validatedItems };
      validateAnalysis(section, chapter.number, version);
      return section;
    }, { schema: sectionSchemas[field] });
    if (field === 'facts') combined.summary = part.summary;
    Object.assign(combined, { [field]: part[field] });
  }
  validateAnalysis(combined, chapter.number, version);
  return combined;
}

export async function reviewBook(run: NovelRun, llm: NovelLLM, phase: 'structure' | 'final'): Promise<ReviewReport> {
  const sources = run.chapters.map(chapter => ({ chapter: chapter.number, version: acceptedVersion(chapter) }));
  if (run.chapters.length !== run.spec.chapterCount || sources.some(source => !source.version) || run.chapters.some(chapter => chapter.candidateRevision !== undefined)) return { validationVersion: 2, status: 'not_checked', checkedRevision: 0, issues: [], error: 'Every chapter must be accepted before book review.' };
  try {
    const ledger = sources.map(source => ({ chapter: source.chapter, revision: source.version.revision, analysis: source.version.analysis }));
    const prompt = `${specPrompt(run.spec)}\nBOOK BLUEPRINT:\n${JSON.stringify(run.blueprint)}\nCOMPLETE BOOK EVIDENCE LEDGER:\n${JSON.stringify(ledger)}\nDETERMINISTIC PROMISE CHECK:\n${JSON.stringify(endingIssues(run))}\nReview the ${phase === 'structure' ? 'whole-book structure before sentence-level editing' : 'final whole-book continuity and resolution'}. Check causal dependencies, escalation of the central conflict, protagonist agency and change, pacing variation, planted clues and earned payoffs, unresolved required promises, and the ending's emotional consequences. Distinguish intentionally open threads from broken promises. Propose precise affected passages, not a blind rewrite. All chapter prose has a separate full-content local review; here assess cross-chapter relationships.\n${issueFormat}`;
    const report = await structuredResponse(prompt, 'You are a developmental editor reviewing a complete novel through its verified evidence ledger. Respond only with JSON.', llm, ['issues'], raw => parseIssues(raw, sources as { chapter: number; version: ChapterVersion }[]), { schema: issueSchema });
    const missing = endingIssues(run);
    if (!report.issues.length && !missing.length && report.discarded) return { validationVersion: 2, status: 'not_checked', checkedRevision: 0, issues: [], error: `The book review cited ${report.discarded} passage(s) that do not appear in the accepted revisions.` };
    return {
      validationVersion: 2,
      status: report.issues.some(issue => issue.severity !== 'minor') || missing.length ? 'failed' : 'passed',
      checkedRevision: 0, issues: report.issues,
      ...(missing.length ? { error: missing.join('\n') } : {}),
    };
  } catch (error) {
    return { validationVersion: 2, status: 'not_checked', checkedRevision: 0, issues: [], error: String(error) };
  }
}
