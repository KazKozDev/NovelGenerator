import type { ReviewIssue } from './contracts';

/**
 * Repairing the passage a finding names, instead of reprinting the chapter around it.
 *
 * Measured over a live run: a repair replaces 1% of a chapter's sentences at the median and never
 * touched more than 15%, yet every one of them asked the writer for the whole chapter back, word for
 * word, and reprinting four thousand words to change two paragraphs is half the running time of the
 * system. It is also where the chapter grows — a model handed the whole text improves what nobody
 * asked about, and one chapter went from 4271 words to 5231 that way.
 *
 * Every finding already carries a verbatim quotation of the prose it is about; a finding without one
 * is discarded before it reaches a repair. So the place is known, and the application can put the
 * replacement back itself — the way the deletion pass already works, where the model chooses and the
 * application cuts. What the writer never sees, it cannot rewrite.
 */
export interface Passage {
  id: string;
  start: number;
  end: number;
  text: string;
  issues: ReviewIssue[];
}

/** A quotation may have been reflowed; the prose is searched as it is written. */
function locate(content: string, quote: string): number {
  const direct = content.indexOf(quote);
  if (direct !== -1) return direct;
  const trimmed = quote.trim();
  return trimmed ? content.indexOf(trimmed) : -1;
}

/** The paragraph an offset falls in: a replacement has to be something with a beginning and an end. */
function paragraphAround(content: string, offset: number): { start: number; end: number } {
  const before = content.lastIndexOf('\n\n', offset);
  const after = content.indexOf('\n\n', offset);
  return { start: before === -1 ? 0 : before + 2, end: after === -1 ? content.length : after };
}

/**
 * The passages a set of findings points at, merged where they overlap and ordered as the chapter runs.
 *
 * Returns nothing when any finding cannot be placed: a repair that silently skipped a finding it could
 * not locate would report itself done while leaving the defect on the page.
 */
export function passagesFor(content: string, issues: ReviewIssue[]): Passage[] | undefined {
  const spans: { start: number; end: number; issue: ReviewIssue }[] = [];
  for (const issue of issues) {
    const quote = issue.evidence.find(item => locate(content, item.quote) !== -1);
    if (!quote) return undefined;
    const { start, end } = paragraphAround(content, locate(content, quote.quote));
    spans.push({ start, end, issue });
  }
  spans.sort((first, second) => first.start - second.start);
  const merged: Passage[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
      last.text = content.slice(last.start, last.end);
      if (!last.issues.includes(span.issue)) last.issues.push(span.issue);
      continue;
    }
    merged.push({ id: `f${merged.length + 1}`, start: span.start, end: span.end, text: content.slice(span.start, span.end), issues: [span.issue] });
  }
  return merged;
}

/**
 * Puts the rewritten passages back, from the end of the chapter forward so earlier offsets stay true.
 * Position is what a passage is identified by, never its text: a sentence that occurs twice in a
 * chapter would otherwise have its other occurrence replaced instead.
 */
export function applyPassages(content: string, passages: Passage[], replacements: Record<string, string>): string {
  let patched = content;
  for (const passage of [...passages].sort((first, second) => second.start - first.start)) {
    const replacement = replacements[passage.id];
    if (replacement === undefined) continue;
    patched = patched.slice(0, passage.start) + replacement.trim() + patched.slice(passage.end);
  }
  return patched;
}

/**
 * Whether this set of findings can be answered in place at all.
 *
 * A finding about a proportion of the chapter — the share of speech that carries an attribution, the
 * density of comparisons — names examples rather than the extent of the defect, and editing the lines
 * it quotes cannot change a proportion. Those still need the whole chapter. So does a repair that
 * would replace most of it: at that point reprinting is not the expensive path, it is the honest one.
 */
export function repairableInPlace(content: string, issues: ReviewIssue[], distributed: string[]): Passage[] | undefined {
  if (!issues.length || issues.some(issue => distributed.includes(issue.id))) return undefined;
  const passages = passagesFor(content, issues);
  if (!passages) return undefined;
  const covered = passages.reduce((total, passage) => total + (passage.end - passage.start), 0);
  return covered > content.length * 0.5 ? undefined : passages;
}
