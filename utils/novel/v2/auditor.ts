import { renderPrompt, systemContract } from '../prompts';
import { wornPhrases } from '../analytics';
import { structuredResponse, type NovelLLM } from './llm';
import type { AuditStatus, BookDesign, FinalReport, ReaderThread, StoryState } from './types';

/**
 * FinalAuditor (P07): checks the finished book and reports. It never rewrites —
 * the report carries evidence and a status, and the manuscript it checked is
 * the manuscript that ships.
 */

export interface AuditInput {
  story_language: string;
  planning_language: string;
  design: BookDesign;
  manuscript: { chapter: number; text: string }[];
  finalState: StoryState;
  threads: ReaderThread[];
  coverage: string;
}

const AUDIT_KEYS = ['coverage', 'findings', 'central_resolution', 'unresolved_major_promises', 'need_more_evidence', 'summary'];

/** The status reflects the checks, never a promise of artistic quality. */
export function settleAuditStatus(report: FinalReport, finishedAllChapters: boolean): AuditStatus {
  if (!finishedAllChapters) return 'PARTIAL';
  if (!report.findings.length) return 'COMPLETE';
  return 'COMPLETE_WITH_WARNINGS';
}

export async function auditBook(input: AuditInput, finishedAllChapters: boolean, llm: NovelLLM): Promise<FinalReport> {
  const system = systemContract({ story_language: input.story_language, planning_language: input.planning_language });
  const material = input.manuscript.map(m => `## Chapter ${m.chapter}\n\n${m.text}`).join('\n\n');
  const prompt = renderPrompt('P07_FINAL_AUDIT', {
    story_contract: JSON.stringify(input.design.contract),
    book_design_digest: JSON.stringify({ dramatic_core: input.design.dramatic_core, causal_map: input.design.causal_map, ending: input.design.ending }),
    manuscript_or_review_material: material,
    final_state: JSON.stringify(input.finalState),
    threads: JSON.stringify(input.threads),
    coverage_description: input.coverage,
  });
  const raw = await structuredResponse(prompt, system, llm, AUDIT_KEYS, parsed => parsed,
    { temperature: 0.1, maxTokens: 16384, route: 'validator' });
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { findings?: unknown }).findings)) {
    throw new Error('Final audit returned no findings array.');
  }
  const report = raw as FinalReport;
  // Measured, not asked: the reviewer reads structure, promises and continuity,
  // and a tic repeated every few pages is invisible at that altitude — the model
  // is reading for what happens, and "his breath hitched" happening seven times
  // is not an event. A rate over the whole manuscript is something code can see
  // and a reader feels, so it is reported beside the model's findings.
  const worn = wornPhrases(input.manuscript.map(item => item.text).join('\n\n'));
  const findings = worn.length
    ? [...report.findings, {
        category: 'prose-texture',
        severity: 'minor',
        description: `The book leans on repeated phrasing: ${worn.map(item => `"${item.phrase}" ${item.uses}×`).join(', ')}.`,
        evidence_refs: [],
        reader_impact: 'A phrase returning every few pages reads as a writing formula rather than as description.',
        certainty: 'measured',
      }]
    : report.findings;
  const measured = { ...report, findings };
  return { ...measured, status: settleAuditStatus(measured, finishedAllChapters) };
}
