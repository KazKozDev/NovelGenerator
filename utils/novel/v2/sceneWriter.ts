import { renderPrompt, systemContract } from '../prompts';
import type { NovelLLM } from './llm';

/**
 * SceneWriter: one verified package in, one finished scene out. A single
 * variant — no competing drafts, no literary second pass. The prompt demands
 * prose only, so the call goes out as raw text (no JSON envelope); the answer
 * is checked for an empty page or planning apparatus, with one retry on a
 * technical breach. Regeneration is never a routine way to reach a style.
 */
export interface SceneWriterInput {
  contextVars: Record<string, string>;
  /** Told what was cut from around the scene, so a removal is never silent. */
  onApparatus?: (removed: string[]) => void;
}

/**
 * What a model says around a scene rather than in it.
 *
 * The prompt asks for the scene text and nothing else, and a small model
 * answers the way it answers a person: "I'll write the opening scene…" above
 * the prose, "Word count: 500" below it, a paragraph on what the scene
 * establishes after that. None of it is fiction and all of it used to ship,
 * because the only apparatus this file recognised was a code fence, a JSON
 * brace and a thinking tag.
 *
 * It is cut rather than sent back. A rewrite to remove a sentence that sits
 * outside the scene costs a full writing call and returns a different scene;
 * the cut costs nothing and leaves every word of the story as written.
 *
 * Only the edges are read. A line is apparatus when it stands alone at the top
 * or the bottom and speaks about the task — the scene, the prose, the
 * instructions, the count. Commentary inside the prose ("the threshold
 * represents her position") is a sentence of narration to code and is left for
 * the editor: telling a narrator's verdict from a writer's note is a reading,
 * and code does not read.
 */
const OPENER = /^[\s*_>]*(?:sure|certainly|of course|absolutely|okay|ok|alright|understood|got it|here(?:'|’)s|here is|here are|below is|i(?:'|’)ll|i will|i(?:'|’)ve|i have|let me|now i)\b/i;
const TASK_NOUN = /\b(?:scene|prose|chapter|draft|passage|instructions?|requirements?|word count)\b/i;
const TASK_VERB = /\b(?:write|writing|written|wrote|craft|crafted|draft|drafted|follow|following|followed|provide|present|continue|continuing)\b/i;
const HEADING = /^(?:#{1,6}\s+\S.*|\*\*[^*\n]{1,80}\*\*:?|(?:scene|chapter)\s+[\w#-]+\s*[:.—-]?\s*[^.!?\n]{0,60})$/i;
const SEPARATOR = /^(?:[-*_]\s?){3,}$/;
const WORD_COUNT = /^[\s[(*_~-]*(?:(?:(?:approx(?:imate(?:ly)?)?\.?|total|final)\s+)?word\s*count\b.*|~?\d[\d,]*\s+words[\s\])*_.]*)$/i;
const NOTE = /^[\s[(*_]*(?:author(?:'|’)s\s+)?notes?\s*[:—-]/i;
const SIGN_OFF = /^[\s[(*_]*(?:let me know|would you like|i hope this|feel free|i(?:'|’)ve (?:kept|written|followed|ensured|ended)|i have (?:kept|written|followed|ensured|ended))\b/i;
const VERDICT = /^[\s[(*_]*(?:this|the) (?:scene|passage|chapter|ending|opening)\b[^\n]*\b(?:represents|symboli[sz]es|shows|demonstrates|establishes|illustrates|conveys|highlights|underscores|reflects|fulfil?ls|satisfies|adheres|follows)\b/i;

function isPreamble(paragraph: string): boolean {
  if (paragraph.includes('\n') || paragraph.length > 240 || /["“”]/.test(paragraph)) return false;
  if (!OPENER.test(paragraph) || !TASK_NOUN.test(paragraph)) return false;
  // "I'll never forget that scene." opens a novel. An announcement of the task
  // either names the act or trails off into the text it introduces.
  return TASK_VERB.test(paragraph) || /(?::|…|\.\.\.)\s*$/.test(paragraph);
}

function isAfterword(paragraph: string): boolean {
  if (paragraph.length > 400) return false;
  return WORD_COUNT.test(paragraph) || NOTE.test(paragraph) || SIGN_OFF.test(paragraph) || VERDICT.test(paragraph);
}

export function stripApparatus(text: string): { prose: string; removed: string[] } {
  const paragraphs = text.trim().split(/\n\s*\n/).map(item => item.trim()).filter(Boolean);
  const removed: string[] = [];
  // Bounded at the top: an announcement, a heading, a rule. A scene whose
  // fourth paragraph still looks like a preamble is a scene, not a preamble.
  for (let step = 0; step < 3 && paragraphs.length > 1; step++) {
    const first = paragraphs[0];
    if (SEPARATOR.test(first)) { paragraphs.shift(); continue; }
    if (!isPreamble(first) && !(HEADING.test(first) && first.length <= 80)) break;
    removed.push(paragraphs.shift()!);
  }
  while (paragraphs.length > 1) {
    const last = paragraphs[paragraphs.length - 1];
    if (SEPARATOR.test(last)) { paragraphs.pop(); continue; }
    if (!isAfterword(last)) break;
    removed.push(paragraphs.pop()!);
  }
  // A count on its own line under the last paragraph, with no blank line between.
  if (paragraphs.length) {
    const lines = paragraphs[paragraphs.length - 1].split('\n');
    while (lines.length > 1 && WORD_COUNT.test(lines[lines.length - 1].trim())) removed.push(lines.pop()!.trim());
    paragraphs[paragraphs.length - 1] = lines.join('\n').trim();
  }
  return { prose: paragraphs.join('\n\n'), removed };
}

function cleanProse(text: unknown): { prose: string; removed: string[] } {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Scene writer returned an empty page.');
  const { prose, removed } = stripApparatus(text);
  if (!prose) throw new Error('Scene writer returned an empty page.');
  if (/^```/.test(prose) || /^\s*\{/.test(prose)) {
    throw new Error('Scene writer returned apparatus instead of prose.');
  }
  if (/<\/?think>/i.test(prose)) throw new Error('Thinking markup remains inside final prose.');
  return { prose, removed };
}

export async function writeSceneV2(input: SceneWriterInput, llm: NovelLLM): Promise<string> {
  const system = systemContract();
  const prompt = renderPrompt('P04_SCENE_WRITE', input.contextVars);
  const accept = (text: unknown): string => {
    const { prose, removed } = cleanProse(text);
    if (removed.length) input.onApparatus?.(removed);
    return prose;
  };
  try {
    return accept(await llm(prompt, system, { temperature: 0.7, maxTokens: 8192, route: 'writer' }));
  } catch (first) {
    const retry = await llm(
      `${prompt}\nYour previous answer was unusable (${first instanceof Error ? first.message : first}). Return only the finished scene prose now.`,
      system,
      { temperature: 0.7, maxTokens: 8192, route: 'writer' },
    );
    return accept(retry);
  }
}
