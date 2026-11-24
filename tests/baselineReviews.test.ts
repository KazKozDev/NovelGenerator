import { describe, expect, it } from 'vitest';
import { baselineReview } from '../utils/novel/craft/baselineReviews';
import { EDITORIAL_FOCUSES, editorialReport, reviseManuscript, reviewManuscript } from '../utils/novel/craft/editorial';
import { cleanAudits, cleanAuditJSON } from './fixtures/baselineAudit';

const input = { premise: 'Nora opens a door.', genre: 'thriller', author_requirements: '', chapter_count: 1, target_total_words: 8 };
const chapters = [{ chapter: 1, text: 'She opened the locked door.' }];

describe('original Craft audits supplement the new editor', () => {
  it('retains both original checklists, their independent outputs and all additional focuses', async () => {
    const prompts: string[] = [];
    for (const focus of ['baseline-developmental', 'baseline-literary']) {
      const review = await baselineReview(input, chapters, focus, async (prompt, system) => {
        prompts.push(prompt);
        expect(system).toContain('THE CORE MODEL: TWO LEVELS OF CRAFT');
        return cleanAuditJSON;
      });
      expect(review.assessment).toEqual(cleanAudits);
      expect(review.failures).toEqual([]);
    }
    expect(prompts[0]).toContain('The Soft Middle');
    expect(prompts[0]).toContain('ANTI-METAPHOR & ACTION');
    expect(prompts[0]).toContain('diagnosticFlawsDetected');
    expect(prompts[1]).toContain('Voice distinctness of characters');
    expect(prompts[1]).toContain('emotionalPayoff');
    expect(EDITORIAL_FOCUSES).toEqual(expect.arrayContaining(['baseline-developmental', 'baseline-literary', 'developmental', 'reader-promises', 'genre', 'opening', 'structure', 'line', 'copyedit', 'proofread']));
  });
  it('routes a grounded original finding into repairs and audits the replacement with both review systems', async () => {
    const finalAudits: string[] = [];
    const result = await reviseManuscript(input, chapters, async (prompt, _s, options) => {
      if (options?.stage === 'craft-editorial-repair') {
        expect(prompt).toContain('Missing key.');
        return JSON.stringify({ changed: true, text: 'She took the key and unlocked the door.' });
      }
      if (prompt.startsWith('ORIGINAL CRAFT AUDIT:')) {
        finalAudits.push(prompt);
        if (prompt.includes('baseline-developmental') && prompt.includes(chapters[0].text)) {
          return JSON.stringify({ ...cleanAudits, causalArcComplete: false, issues: [{ category: 'causality', severity: 'major', reason: 'Missing key.', quotes: [chapters[0].text] }] });
        }
      }
      return cleanAuditJSON;
    }, () => {}, () => {});
    expect(result.history[0].focus).toBe('baseline-developmental');
    expect(result.chapters[0].text).toContain('took the key');
    expect(finalAudits.slice(-2).every(p => p.includes(result.chapters[0].text))).toBe(true);
    expect(editorialReport(result.chapters, 1, result.reviews).status).toBe('COMPLETE');
  });
  it('never converts missing original audit fields or unsupported accusations into passed checks', async () => {
    const missing = await reviewManuscript(input, chapters, 'baseline-developmental', async () => '{"issues":[]}');
    expect(missing.failures[0]).toContain('Missing original');
    const unsupported = await baselineReview(input, chapters, 'baseline-developmental', async () => JSON.stringify({ ...cleanAudits, causalArcComplete: false, issues: [{ category: 'causality', severity: 'major', reason: 'Invented event.', quotes: ['Not in the book.'] }] }));
    expect(unsupported.issues).toEqual([]);
    expect(unsupported.failures.length).toBeGreaterThan(0);
    const report = editorialReport(chapters, 1, [unsupported, { focus: 'developmental', issues: [], failures: [] }]);
    expect(report.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(report.central_resolution.supported).toBe(false);
  });
});
