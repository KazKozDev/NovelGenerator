import { describe, expect, it } from 'vitest';
import {
  findTargetChapter,
  buildTargetedRepairPrompt,
  parseRepairJson,
  repairSingleFinding,
  clusterEditorialFindings,
  applySurgicalPatch,
  locateTargetExcerpt,
  buildSurgicalPatchPrompt,
  repairSurgicalTask,
  ClusteredEditorialTask,
  EditorialFinding,
} from '../utils/novel/targetedEditorial';

describe('targetedEditorial', () => {
  const chapters = [
    { num: 1, content: 'Bruce was wearing a green coat. He walked to the car.' },
    { num: 2, content: 'Clark held the log in his hands. He opened the drawer.' },
    { num: 3, content: 'The rain fell on the roof. Clark spoke into the phone.' },
  ];

  it('finds target chapter from evidence_refs', () => {
    const finding = {
      description: 'The coat color changed inexplicably.',
      evidence_refs: ['chapter-1: Bruce was wearing a green coat.'],
    };
    expect(findTargetChapter(finding, chapters)).toBe(1);
  });

  it('finds target chapter from description when evidence_refs is empty', () => {
    const finding = {
      description: 'In Chapter 2, Clark never explains where the log came from.',
      evidence_refs: [],
    };
    expect(findTargetChapter(finding, chapters)).toBe(2);
  });

  it('picks the later chapter when two chapters contradict each other', () => {
    const finding = {
      description: 'Conflict between coat in chapter 1 and chapter 3.',
      evidence_refs: ['chapter-1: green coat', 'chapter-3: blue coat'],
    };
    expect(findTargetChapter(finding, chapters)).toBe(3);
  });

  it('parses JSON responses with and without code fences', () => {
    const direct = '{"changed": true, "explanation": "Fixed", "text": "New text"}';
    expect(parseRepairJson(direct)).toEqual({ changed: true, explanation: 'Fixed', text: 'New text' });

    const fenced = '```json\n{"changed": true, "explanation": "Fixed fenced", "text": "Fenced text"}\n```';
    expect(parseRepairJson(fenced)).toEqual({ changed: true, explanation: 'Fixed fenced', text: 'Fenced text' });

    const braced = 'Here is the fix: {"changed": false, "explanation": "Already good"} thanks';
    expect(parseRepairJson(braced)).toEqual({ changed: false, explanation: 'Already good' });

    expect(parseRepairJson('invalid json string')).toBeNull();
  });

  it('builds a focused prompt containing the finding and chapter prose', () => {
    const finding = {
      category: 'Causality',
      severity: 'major',
      description: 'The log is missing an origin.',
      evidence_refs: ['chapter-2: Clark held the log'],
    };
    const { prompt, system } = buildTargetedRepairPrompt(finding, 2, chapters[1].content);
    expect(prompt).toContain('EDITORIAL FINDING TO FIX:');
    expect(prompt).toContain('The log is missing an origin.');
    expect(prompt).toContain('chapter-2: Clark held the log');
    expect(prompt).toContain('CURRENT CHAPTER 2 PROSE:');
    expect(prompt).toContain(chapters[1].content);
    expect(system).toContain('minimal, surgical edits');
  });

  it('repairs a single finding and updates the manuscript', async () => {
    const manuscript = '# Test Novel\n\n## Chapter 1\n\n' + chapters[0].content + '\n\n## Chapter 2\n\n' + chapters[1].content;
    const finding = {
      description: 'Clark needs to look at the desk before opening the drawer.',
      evidence_refs: ['chapter-2: Clark held the log in his hands.'],
    };

    const mockLlm = async (p: string) => {
      expect(p).toContain('Clark needs to look at the desk');
      return JSON.stringify({
        changed: true,
        explanation: 'Added gaze toward the desk first',
        text: 'Clark looked at the desk, then held the log in his hands. He opened the drawer.',
      });
    };

    const result = await repairSingleFinding(finding, manuscript, 'Test Novel', mockLlm);
    expect(result.changed).toBe(true);
    expect(result.chapterNumber).toBe(2);
    expect(result.explanation).toBe('Added gaze toward the desk first');
    expect(result.updatedManuscript).toContain('Clark looked at the desk, then held the log');
    expect(result.updatedManuscript).toContain('Bruce was wearing a green coat');
  });

  it('parses author model tag from run_log or metadata', async () => {
    const { parseModelConfigFromTag, formatModelDisplayLabel } = await import('../utils/novel/targetedEditorial');

    const deepseekTag = 'author: ollama:deepseek-v4.1-flash:cloud · reader: huggingface:XiaomiMiMo/MiMo-V2.5-Pro';
    const parsed = parseModelConfigFromTag(deepseekTag);
    expect(parsed).toEqual({
      provider: 'ollama',
      ollamaModel: 'deepseek-v4.1-flash:cloud',
      ollamaEndpoint: '/api/ollama',
    });
    expect(formatModelDisplayLabel(parsed!)).toBe('DeepSeek (deepseek-v4.1-flash:cloud)');

    const qwenTag = 'author: qwen:qwen3.8-flash · reader: the author\'s own';
    const parsedQwen = parseModelConfigFromTag(qwenTag);
    expect(parsedQwen).toEqual({
      provider: 'qwen',
      qwenModel: 'qwen3.8-flash',
    });
    expect(formatModelDisplayLabel(parsedQwen!)).toBe('Qwen: qwen3.8-flash');
  });

  describe('Clustering & Hierarchy', () => {
    it('clusters raw duplicate findings into prioritized tasks ordered High -> Medium -> Low', () => {
      const rawFindings: EditorialFinding[] = [
        // 3 duplicates for teleportation
        { description: 'The log and key teleport from apartment to study.', category: 'causality', severity: 'major', evidence_refs: ['chapter-1: coat pocket'] },
        { description: 'How did the log get here? Impossible relocation.', category: 'props', severity: 'major', evidence_refs: ['chapter-1: left the log in his coat'] },
        { description: 'Relocation of log and key has no transition.', category: 'causality', severity: 'major', evidence_refs: ['chapter-1: elevator'] },
        // 2 duplicates for wound logic
        { description: 'Clark wound center holds open while edges heal without explanation.', category: 'specific craft defect', severity: 'major', evidence_refs: ['chapter-2: gash runs four inches'] },
        { description: 'Suture needle left through skin and never cut or removed.', category: 'specific craft defect', severity: 'major', evidence_refs: ['chapter-2: thread stays where it is'] },
        // 1 for crystal
        { description: 'The luminous crystal on pillow has no payoff.', category: 'props', severity: 'major', evidence_refs: ['chapter-3: crystal on pillow'] },
        // 1 for phone caller Lois
        { description: 'Phone caller is Lois but name is hidden from reader.', category: 'props', severity: 'major', evidence_refs: ['chapter-3: name fills the glass'] },
        // 1 for counting seconds
        { description: 'Repeated tic of counting seconds out loud.', category: 'style', severity: 'minor', evidence_refs: ['chapter-1: counts it—one, two, three'] },
      ];

      const tasks = clusterEditorialFindings(rawFindings, chapters);

      // Verify consolidation into distinct canonical tasks
      expect(tasks.length).toBe(5);

      // Verify the teleportation bucket grouped 3 findings
      const teleportTask = tasks.find(t => t.id === 'prop-teleportation');
      expect(teleportTask).toBeDefined();
      expect(teleportTask?.rawFindingIndices.length).toBe(3);
      expect(teleportTask?.priority).toBe('high');
      expect(teleportTask?.canonicalDirective).toContain('суперскорости');

      // Verify wound task grouped 2 findings
      const woundTask = tasks.find(t => t.id === 'clark-wound-logic');
      expect(woundTask).toBeDefined();
      expect(woundTask?.rawFindingIndices.length).toBe(2);
      expect(woundTask?.priority).toBe('high');
      expect(woundTask?.canonicalDirective).toContain('криптонит');

      // Verify crystal task has medium priority
      const crystalTask = tasks.find(t => t.id === 'crystal-payoff');
      expect(crystalTask?.priority).toBe('medium');

      // Verify Lois phone call has medium priority
      const phoneTask = tasks.find(t => t.id === 'phone-caller-lois');
      expect(phoneTask?.priority).toBe('medium');

      // Verify counting seconds has low priority
      const countingTask = tasks.find(t => t.id === 'counting-tic-moderation');
      expect(countingTask?.priority).toBe('low');

      // Verify strict priority hierarchy ordering: all 'high' tasks must precede all 'medium' and 'low' tasks
      const priorities = tasks.map(t => t.priority);
      const highIndices = priorities.map((p, i) => (p === 'high' ? i : -1)).filter(i => i !== -1);
      const medIndices = priorities.map((p, i) => (p === 'medium' ? i : -1)).filter(i => i !== -1);
      const lowIndices = priorities.map((p, i) => (p === 'low' ? i : -1)).filter(i => i !== -1);

      expect(Math.max(...highIndices)).toBeLessThan(Math.min(...medIndices));
      expect(Math.max(...medIndices)).toBeLessThan(Math.min(...lowIndices));
    });

    it('marks contradictory genre-pacing deletion requests as dismissed according to canon', () => {
      const rawFindings: EditorialFinding[] = [
        {
          description: 'Cut first 250 words of atmospheric inventory and chair squaring for fast action.',
          category: 'flaw',
          severity: 'minor',
          evidence_refs: ['chapter-1: straight-backed chair by the window'],
        },
      ];

      const tasks = clusterEditorialFindings(rawFindings, chapters);
      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe('genre-pacing-preservation');
      expect(tasks[0].isDismissed).toBe(true);
      expect(tasks[0].dismissReason).toContain('Отклонено в соответствии с каноном');
    });
  });

  describe('Surgical Patching Engine (find -> replace)', () => {
    const chapterProse = `He crossed the bare floor. The boards were pale and scuffed at the traffic lines.

The gash ran four inches from wrist to elbow, shallow at both ends, deep in the middle where the rebar caught him. The edges drew together like ice on a pond, but the center held open. The thread stayed where it was through the skin, and he did not cut it.

He walked to the heavy oak door.`;

    it('applies exact find and replace leaving 99.5% of the text untouched', () => {
      const findSnippet = 'The thread stayed where it was through the skin, and he did not cut it.';
      const replaceSnippet =
        'Bruce tied off the filament with a secure surgeon knot, snipped the excess thread, and pressed a clean gauze pad against the seal.';

      const result = applySurgicalPatch(chapterProse, findSnippet, replaceSnippet);
      expect(result.changed).toBe(true);
      expect(result.method).toBe('exact');
      expect(result.patchedText).toContain(replaceSnippet);
      // Unrelated paragraphs remain completely unchanged
      expect(result.patchedText).toContain('He crossed the bare floor. The boards were pale');
      expect(result.patchedText).toContain('He walked to the heavy oak door.');
      expect(result.patchedText).not.toContain(findSnippet);
    });

    it('handles normalized quotes and dashes in surgical patch', () => {
      const findWithQuotes = 'The edges drew together “like ice on a pond”—but the center held open.';
      const replaceSnippet = 'The edges drew together like ice on a pond, but residual trace dust held the center open.';

      // Original has standard quotes and dashes
      const result = applySurgicalPatch(chapterProse, findWithQuotes, replaceSnippet);
      expect(result.changed).toBe(true);
      expect(result.patchedText).toContain('residual trace dust held the center open.');
      expect(result.patchedText).toContain('He walked to the heavy oak door.');
    });

    it('locates target excerpt and scene context from quotes', () => {
      const quote = 'where the rebar caught him';
      const { targetExcerpt, sceneContext } = locateTargetExcerpt(chapterProse, [quote]);
      expect(targetExcerpt).toContain('The gash ran four inches');
      expect(sceneContext).toContain('He crossed the bare floor');
    });

    it('executes repairSurgicalTask end-to-end with mock LLM', async () => {
      const manuscript = `# The Gotham Protocol\n\n## Chapter 1\n\n${chapterProse}`;
      const task: ClusteredEditorialTask = {
        id: 'clark-wound-logic',
        title: 'Логика заживления раны предплечья Кларка',
        chapterNumber: 1,
        priority: 'high',
        category: 'Физическая логика мира',
        problemSummary: 'Центр раны держится открытым без объяснения причин.',
        canonicalDirective: 'Указать на микроскопическую криптонитовую пыль в бетоне.',
        targetQuotes: ['The edges drew together like ice on a pond, but the center held open.'],
        rawFindingIndices: [0],
      };

      const mockLlm = async (prompt: string) => {
        expect(prompt).toContain('SURGICAL EDITORIAL TASK:');
        expect(prompt).toContain('CANONICAL AUTHOR DIRECTIVE');
        expect(prompt).toContain('микроскопическую криптонитовую пыль');

        return JSON.stringify({
          changed: true,
          find: 'The edges drew together like ice on a pond, but the center held open.',
          replace:
            'The edges drew together like ice on a pond, but the center resisted: micro-particles of kryptonite dust from the collapsed dock concrete blocked cellular regeneration.',
          explanation: 'Добавлено указание на криптонитовую пыль из доков',
        });
      };

      const result = await repairSurgicalTask(task, manuscript, 'The Gotham Protocol', mockLlm);
      expect(result.changed).toBe(true);
      expect(result.chapterNumber).toBe(1);
      expect(result.patchMethod).toBe('exact');
      expect(result.updatedManuscript).toContain('micro-particles of kryptonite dust from the collapsed dock');
      expect(result.updatedManuscript).toContain('He crossed the bare floor.');
      expect(result.updatedManuscript).toContain('He walked to the heavy oak door.');
    });
  });
});
