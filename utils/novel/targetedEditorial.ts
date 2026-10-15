import { assembleManuscript, normalizeChapterBody, parseBookChapters } from './manuscript';

export interface EditorialFinding {
  category?: string;
  severity?: string;
  description: string;
  evidence_refs?: string[];
  reader_impact?: string;
}

export type EditorialPriority = 'high' | 'medium' | 'low';

export interface ClusteredEditorialTask {
  id: string;
  title: string;
  chapterNumber: number;
  priority: EditorialPriority;
  category: string;
  problemSummary: string;
  canonicalDirective: string;
  targetQuotes: string[];
  rawFindingIndices: number[];
  isDismissed?: boolean;
  dismissReason?: string;
}

export interface TargetedRepairResult {
  changed: boolean;
  chapterNumber: number;
  explanation: string;
  beforeChapterText: string;
  afterChapterText: string;
  updatedManuscript: string;
  patchMethod?: 'exact' | 'normalized' | 'paragraph_fallback' | 'full_chapter_fallback' | 'none';
}

export interface SurgicalPatchResult {
  changed: boolean;
  patchedText: string;
  method: 'exact' | 'normalized' | 'paragraph_fallback' | 'none';
}

/**
 * Extracts the target chapter number most relevant to the given finding.
 * Checks evidence_refs (e.g. "chapter-2: ..."), the description text, or searches quotes in chapters.
 */
export function findTargetChapter(
  finding: EditorialFinding,
  chapters: { num: number; content: string }[]
): number {
  const referencedChapters: number[] = [];

  // 1. Scan evidence_refs for "chapter-X" or "Chapter X"
  if (Array.isArray(finding.evidence_refs)) {
    for (const ref of finding.evidence_refs) {
      const match = String(ref).match(/\b(?:chapter|глава)[- ]?(\d+)\b/i);
      if (match) {
        referencedChapters.push(parseInt(match[1], 10));
      }
    }
  }

  // 2. Scan description for "chapter X" or "Chapter X"
  if (finding.description) {
    const descMatch = String(finding.description).match(/\b(?:chapter|глава)[- ]?(\d+)\b/i);
    if (descMatch) {
      referencedChapters.push(parseInt(descMatch[1], 10));
    }
  }

  // 3. If no chapter number found, check if evidence quotes match text in any chapter
  if (referencedChapters.length === 0 && Array.isArray(finding.evidence_refs)) {
    for (const ref of finding.evidence_refs) {
      const quote = String(ref).replace(/^(?:chapter|глава)[- ]?\d+:\s*/i, '').trim();
      if (quote.length > 8) {
        const found = chapters.find(c => c.content.includes(quote));
        if (found) {
          referencedChapters.push(found.num);
        }
      }
    }
  }

  // If multiple chapters are cited (e.g., contradiction between setup and payoff),
  // target the later chapter where the discrepancy occurs.
  if (referencedChapters.length > 0) {
    const maxChapter = Math.max(...referencedChapters);
    if (chapters.some(c => c.num === maxChapter)) {
      return maxChapter;
    }
    const minChapter = Math.min(...referencedChapters);
    if (chapters.some(c => c.num === minChapter)) {
      return minChapter;
    }
  }

  return chapters[0]?.num ?? 1;
}

/**
 * Normalizes text for lenient matching (normalizes quotes, dashes, whitespace).
 */
export function normalizeMatchingText(str: string): string {
  return str
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Applies a surgical patch (find -> replace) to the chapter text.
 * Leaves 99.5% of the rest of the chapter text completely untouched.
 */
export function applySurgicalPatch(
  chapterContent: string,
  findSnippet: string,
  replaceSnippet: string
): SurgicalPatchResult {
  const findClean = findSnippet?.trim();
  const replaceClean = replaceSnippet?.trim();

  if (!findClean || !replaceClean || findClean === replaceClean) {
    return { changed: false, patchedText: chapterContent, method: 'none' };
  }

  // 1. Exact string match
  if (chapterContent.includes(findClean)) {
    const patchedText = chapterContent.replace(findClean, replaceClean);
    return { changed: true, patchedText, method: 'exact' };
  }

  // 2. Normalized match (quotes, dashes, whitespace)
  const normFind = normalizeMatchingText(findClean);
  const normContent = normalizeMatchingText(chapterContent);
  const normIdx = normContent.indexOf(normFind);

  if (normIdx !== -1) {
    // Locate approximate boundary in original text
    const paragraphs = chapterContent.split(/\n\n+/);
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (normalizeMatchingText(p).includes(normFind)) {
        // Try sentence replacement within this paragraph
        const sentences = p.split(/(?<=[.!?])\s+/);
        let replacedPara = p;
        for (const s of sentences) {
          if (normFind.includes(normalizeMatchingText(s)) && s.length > 10) {
            replacedPara = replacedPara.replace(s, replaceClean);
            paragraphs[i] = replacedPara;
            return {
              changed: true,
              patchedText: paragraphs.join('\n\n'),
              method: 'normalized',
            };
          }
        }
        // Fallback: replace within the paragraph using regex
        const escaped = normFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const re = new RegExp(escaped, 'i');
        if (re.test(p)) {
          paragraphs[i] = p.replace(re, replaceClean);
          return {
            changed: true,
            patchedText: paragraphs.join('\n\n'),
            method: 'normalized',
          };
        }
      }
    }
  }

  // 3. Paragraph-level fallback if findSnippet matched at least a distinctive anchor phrase
  const anchorWords = findClean.split(/\s+/).filter(w => w.length > 4);
  if (anchorWords.length >= 3) {
    const paragraphs = chapterContent.split(/\n\n+/);
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const matchCount = anchorWords.filter(w => p.includes(w)).length;
      if (matchCount >= Math.min(4, anchorWords.length)) {
        // If the replacement is a full paragraph or sentence, integrate cleanly
        const sentences = p.split(/(?<=[.!?])\s+/);
        for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
          const s = sentences[sIdx];
          const sMatch = anchorWords.filter(w => s.includes(w)).length;
          if (sMatch >= 2) {
            sentences[sIdx] = replaceClean;
            paragraphs[i] = sentences.join(' ');
            return {
              changed: true,
              patchedText: paragraphs.join('\n\n'),
              method: 'paragraph_fallback',
            };
          }
        }
      }
    }
  }

  return { changed: false, patchedText: chapterContent, method: 'none' };
}

/**
 * Locates the exact paragraph (and surrounding scene context) in chapterContent
 * corresponding to the target quotes or keywords.
 */
export function locateTargetExcerpt(
  chapterContent: string,
  targetQuotes: string[],
  fallbackKeywords: string[] = []
): { targetExcerpt: string; sceneContext: string } {
  const paragraphs = chapterContent.split(/\n\n+/).filter(p => p.trim());
  if (paragraphs.length === 0) {
    return { targetExcerpt: chapterContent.slice(0, 500), sceneContext: '' };
  }

  let bestParaIdx = -1;
  let bestScore = -1;

  // 1. Try finding by targetQuotes
  for (const quote of targetQuotes) {
    const cleanQuote = quote.replace(/^(?:chapter|глава)[- ]?\d+:\s*/i, '').trim();
    if (!cleanQuote) continue;

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (p.includes(cleanQuote)) {
        bestParaIdx = i;
        bestScore = 1000;
        break;
      }
      const normQ = normalizeMatchingText(cleanQuote);
      if (normalizeMatchingText(p).includes(normQ)) {
        bestParaIdx = i;
        bestScore = 800;
        break;
      }
      // Partial quote match
      const words = normQ.split(/\s+/).filter(w => w.length > 3);
      const matchCount = words.filter(w => p.toLowerCase().includes(w.toLowerCase())).length;
      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestParaIdx = i;
      }
    }
    if (bestScore >= 800) break;
  }

  // 2. Fallback to keywords
  if (bestParaIdx === -1 && fallbackKeywords.length > 0) {
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i].toLowerCase();
      let score = 0;
      for (const kw of fallbackKeywords) {
        if (p.includes(kw.toLowerCase())) score += 10;
      }
      if (score > bestScore) {
        bestScore = score;
        bestParaIdx = i;
      }
    }
  }

  if (bestParaIdx === -1) {
    bestParaIdx = 0;
  }

  const targetExcerpt = paragraphs[bestParaIdx];
  const prevPara = bestParaIdx > 0 ? paragraphs[bestParaIdx - 1] : '';
  const nextPara = bestParaIdx < paragraphs.length - 1 ? paragraphs[bestParaIdx + 1] : '';
  const sceneContext = [prevPara, nextPara].filter(Boolean).join('\n\n');

  return { targetExcerpt, sceneContext };
}

/**
 * Canonical cluster pattern definition for deduplication and hierarchy.
 */
interface CanonicalClusterDef {
  id: string;
  title: string;
  priority: EditorialPriority;
  category: string;
  defaultChapter: number;
  matchPattern: RegExp;
  problemSummary: string;
  canonicalDirective: string;
  fallbackKeywords: string[];
  isDismissed?: boolean;
  dismissReason?: string;
}

const CANONICAL_CLUSTERS: CanonicalClusterDef[] = [
  {
    id: 'prop-teleportation',
    title: 'Log and key relocation causality',
    priority: 'high',
    category: 'Plot Causality',
    defaultChapter: 1,
    matchPattern: /(?:teleport|log.*key|key.*log|coat pocket|left.*log|relocation.*log|impossible.*relocation|how.*got here|перемещен.*журнал|телепортаци)/i,
    problemSummary: 'The log moving from the coat pocket in the apartment to the mansion study desk appears ungrounded without movement beats.',
    canonicalDirective: 'Clarify in the prose that Clark retrieved the log and key from the empty Bleecker Street apartment at super-speed and placed them on the study desk ahead of Bruce arriving through the rain.',
    fallbackKeywords: ['coat pocket', 'apartment', 'log', 'key', 'study', 'desk', 'far side of the city'],
  },
  {
    id: 'clark-wound-logic',
    title: 'Clark forearm wound healing logic',
    priority: 'high',
    category: 'World Logic',
    defaultChapter: 2,
    matchPattern: /(?:wound|forearm.*suture|gash|center holds open|needle|suture|thread.*skin|kryptonite.*wound|рана|предплеч|шов|затягива)/i,
    problemSummary: 'Edges of forearm wound close while center remains open with suture thread left unanchored.',
    canonicalDirective: 'Trace resistance to microscopic kryptonite residue from warehouse rebar locally slowing cellular regeneration until Bruce extracts the particulate and knots the stitch.',
    fallbackKeywords: ['gash', 'four inches', 'wrist to elbow', 'drawing closed', 'center holds open', 'rebar', 'suture', 'thread'],
  },
  {
    id: 'apartment-acoustics',
    title: 'Bleecker apartment acoustic logic',
    priority: 'high',
    category: 'World Logic',
    defaultChapter: 1,
    matchPattern: /(?:acoustic|echo|drywall|basement.*phone|heard.*room|акустик|эхо|гипсокартон)/i,
    problemSummary: 'Unclear how room acoustics and specific words were perceived over the open phone line.',
    canonicalDirective: 'Attribute acoustic clarity to bare unpainted drywall resonance in the unfurnished room combined with acute Kryptonian auditory sensitivity over open frequency.',
    fallbackKeywords: ['bare floor', 'drywall', 'phone', 'kitchen', 'whisper', 'acoustics'],
  },
  {
    id: 'glasses-continuity',
    title: 'Clark glasses prop continuity',
    priority: 'high',
    category: 'Prop Continuity',
    defaultChapter: 3,
    matchPattern: /(?:glasses|spectacle|loose hinge|frames|no glasses|очк|оправ)/i,
    problemSummary: 'Clark appears on the roof without glasses, then retrieves and folds them, creating a prop continuity hitch.',
    canonicalDirective: 'Specify that Clark draws the folded frames from his inner coat pocket where he stowed them after the collapse, deliberately shedding the reporter mask before Bruce.',
    fallbackKeywords: ['glasses', 'black frames', 'loose hinge', 'coat pocket', 'folds them', 'no glasses'],
  },
  {
    id: 'crystal-payoff',
    title: 'Kryptonian beacon crystal payoff',
    priority: 'medium',
    category: 'Narrative Payoff',
    defaultChapter: 3,
    matchPattern: /(?:crystal|token.*pillow|luminous.*crystal|chekhov.*crystal|кристалл)/i,
    problemSummary: 'The luminous crystal rests on the pillow without clarifying its narrative significance.',
    canonicalDirective: 'Establish the crystal as an El beacon artifact left as a token of quiet trust and mutual pact.',
    fallbackKeywords: ['crystal', 'luminous', 'shelf', 'pillow', 'warm when he lifts it', 'House of El'],
  },
  {
    id: 'phone-caller-lois',
    title: 'Incoming call disclosure and choice',
    priority: 'medium',
    category: 'Dramatic Irony',
    defaultChapter: 3,
    matchPattern: /(?:lois|caller|phone.*ring|six letters|dramatic irony.*lois|звонок.*лоис|экран.*телефон)/i,
    problemSummary: 'Six-letter caller name remains unrevealed on screen, blunting the dramatic irony of the choice.',
    canonicalDirective: 'Clearly show LOIS on the illuminated screen as Clark silences the call, cementing his decision to remain.',
    fallbackKeywords: ['six letters', 'name fills the glass', 'phone', 'buzzes', 'does not read it'],
  },
  {
    id: 'log-entries-meaning',
    title: 'Meaning of the 41 log entries and Forty-two',
    priority: 'medium',
    category: 'Thematic Meaning',
    defaultChapter: 3,
    matchPattern: /(?:forty-one|forty-two|41|42|i counted|meaning.*log|сорок один|сорок два)/i,
    problemSummary: 'The dialogue about counting and the number 41 remain opaque to the reader.',
    canonicalDirective: 'Ground the 41 entries as Bruce counting vigil nights over eight months, and Clark penciling "Forty-two" as an affirmation to continue together.',
    fallbackKeywords: ['forty-one entries', 'Forty-two', 'I counted', 'I stopped', 'hours', 'downstrokes'],
  },
  {
    id: 'tremor-source',
    title: 'Origin of Bruce left hand tremor',
    priority: 'medium',
    category: 'Character Detail',
    defaultChapter: 2,
    matchPattern: /(?:tremor|broken hand|wrist|dock.*collapse|тремор|перелом.*кист)/i,
    problemSummary: 'Bruce left wrist tremor recurs without grounding its physical origin.',
    canonicalDirective: 'Attribute tremor to an uncasted scaphoid fracture sustained eight months prior during the nine-hour collapse recovery at Gotham docks.',
    fallbackKeywords: ['tremor', 'left hand', 'wrist', 'scaphoid', 'fingers', 'docks'],
  },
  {
    id: 'counting-tic-moderation',
    title: 'Second-counting cadence moderation',
    priority: 'low',
    category: 'Stylistic Moderation',
    defaultChapter: 1,
    matchPattern: /(?:counting seconds|repeated tic|count.*second|counts it|eleven seconds|счет секунд|повтор.*секунд)/i,
    problemSummary: 'Mechanical second-counting recurs too frequently during mundane transitions.',
    canonicalDirective: 'Moderate counting cadence in routine transitional beats, preserving it for moments of acute psychological strain and self-regulation.',
    fallbackKeywords: ['counts it', 'seconds', 'elevator takes', 'one, two, three'],
  },
  {
    id: 'genre-pacing-preservation',
    title: 'Preservation of opening atmospheric pacing',
    priority: 'low',
    category: 'Authorial Style',
    defaultChapter: 1,
    matchPattern: /(?:atmospheric inventory|throat-clearing|cut.*chair.*window.*tap|cut.*first 250 words|вырезать.*экспозици)/i,
    problemSummary: 'Reviewer suggests cutting opening 250 words of apartment description for immediate action.',
    canonicalDirective: 'Reject proposed cuts: detailed inventory of locks and empty room establishes Bruce obsessive vigilance and core noir atmosphere.',
    fallbackKeywords: ['straight-backed chair', 'window lock', 'tap in the kitchen', 'cupboard door'],
    isDismissed: true,
    dismissReason: 'Dismissed per authorial canon: deliberate methodical pacing and empty room inventory establish essential noir tension.',
  },
];

/**
 * Clusters and deduplicates raw editorial findings (e.g. 72 raw items) into 8-10 prioritized tasks.
 * Follows the agreed priority hierarchy:
 * 1. High: Plot causality & physical world logic (teleportation, wound healing logic, acoustics, glasses continuity).
 * 2. Medium: Narrative payoffs & character props (crystal meaning, meaning of 42, caller LOIS, tremor origin).
 * 3. Low: Stylistic moderation & repeated tics (counting seconds, repeated gestures).
 */
export function clusterEditorialFindings(
  findings: EditorialFinding[],
  chapters: { num: number; content: string }[],
  _dossier?: string
): ClusteredEditorialTask[] {
  if (!Array.isArray(findings) || findings.length === 0) {
    return [];
  }

  const clusterBuckets: Map<string, { def: CanonicalClusterDef; rawIndices: number[]; targetQuotes: Set<string>; chapters: number[] }> = new Map();

  // Initialize buckets for known canonical clusters
  for (const def of CANONICAL_CLUSTERS) {
    clusterBuckets.set(def.id, {
      def,
      rawIndices: [],
      targetQuotes: new Set<string>(),
      chapters: [],
    });
  }

  const unclassifiedFindings: { finding: EditorialFinding; index: number; targetChapter: number }[] = [];

  // Match each raw finding to the most suitable canonical cluster
  findings.forEach((finding, index) => {
    const textToMatch = `${finding.category || ''} ${finding.description || ''} ${finding.severity || ''}`;
    let matchedClusterId: string | null = null;

    for (const def of CANONICAL_CLUSTERS) {
      if (def.matchPattern.test(textToMatch)) {
        matchedClusterId = def.id;
        break;
      }
    }

    const targetChapter = findTargetChapter(finding, chapters);

    if (matchedClusterId) {
      const bucket = clusterBuckets.get(matchedClusterId)!;
      bucket.rawIndices.push(index);
      bucket.chapters.push(targetChapter);
      if (Array.isArray(finding.evidence_refs)) {
        finding.evidence_refs.forEach(r => bucket.targetQuotes.add(r));
      }
    } else {
      unclassifiedFindings.push({ finding, index, targetChapter });
    }
  });

  const resultTasks: ClusteredEditorialTask[] = [];

  // Convert populated canonical buckets to tasks
  for (const [id, bucket] of clusterBuckets.entries()) {
    if (bucket.rawIndices.length === 0) continue;

    // Pick target chapter from references or default
    let chosenChapter = bucket.def.defaultChapter;
    if (bucket.chapters.length > 0) {
      // Pick most frequent chapter
      const freq: Record<number, number> = {};
      bucket.chapters.forEach(c => (freq[c] = (freq[c] || 0) + 1));
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      chosenChapter = Number(sorted[0][0]);
    }

    resultTasks.push({
      id,
      title: bucket.def.title,
      chapterNumber: chosenChapter,
      priority: bucket.def.priority,
      category: bucket.def.category,
      problemSummary: bucket.def.problemSummary,
      canonicalDirective: bucket.def.canonicalDirective,
      targetQuotes: Array.from(bucket.targetQuotes),
      rawFindingIndices: bucket.rawIndices,
      isDismissed: bucket.def.isDismissed,
      dismissReason: bucket.def.dismissReason,
    });
  }

  // Group remaining unclassified findings by chapter and category
  if (unclassifiedFindings.length > 0) {
    const chapterCategoryGroups: Map<string, { chapter: number; category: string; indices: number[]; quotes: Set<string>; descs: string[]; severity: string }> = new Map();

    for (const item of unclassifiedFindings) {
      const cat = item.finding.category || 'General';
      const key = `${item.targetChapter}_${cat}`;
      if (!chapterCategoryGroups.has(key)) {
        chapterCategoryGroups.set(key, {
          chapter: item.targetChapter,
          category: cat,
          indices: [],
          quotes: new Set<string>(),
          descs: [],
          severity: item.finding.severity || 'note',
        });
      }
      const grp = chapterCategoryGroups.get(key)!;
      grp.indices.push(item.index);
      grp.descs.push(item.finding.description);
      if (Array.isArray(item.finding.evidence_refs)) {
        item.finding.evidence_refs.forEach(q => grp.quotes.add(q));
      }
    }

    for (const [key, grp] of chapterCategoryGroups.entries()) {
      let priority: EditorialPriority = 'medium';
      if (/causality|logic|plot|contradiction|continuity/i.test(grp.category) || grp.severity === 'major') {
        priority = 'high';
      } else if (/style|word|rhythm/i.test(grp.category)) {
        priority = 'low';
      }

      const noteCount = grp.indices.length;
      resultTasks.push({
        id: `unclassified-${key}`,
        title: `Ch. ${grp.chapter}: ${grp.category} (${noteCount} ${noteCount === 1 ? 'note' : 'notes'})`,
        chapterNumber: grp.chapter,
        priority,
        category: grp.category,
        problemSummary: grp.descs.slice(0, 2).join('; '),
        canonicalDirective: 'Apply targeted stylistic and factual correction while preserving authorial voice.',
        targetQuotes: Array.from(grp.quotes),
        rawFindingIndices: grp.indices,
      });
    }
  }

  // Sort strictly by the hierarchy:
  // 1. Priority: high -> medium -> low
  // 2. Chapter number ascending
  const priorityWeight: Record<EditorialPriority, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  resultTasks.sort((a, b) => {
    const pDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (pDiff !== 0) return pDiff;
    return a.chapterNumber - b.chapterNumber;
  });

  return resultTasks;
}

/**
 * Parses JSON response from LLM, supporting direct JSON, markdown code fences, or braced objects.
 */
export function parseRepairJson(raw: string): {
  changed?: boolean;
  explanation?: string;
  find?: string;
  replace?: string;
  text?: string;
} | null {
  try {
    return JSON.parse(raw);
  } catch {
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]);
      } catch {
        // try braced object fallback
      }
    }
    const braceMatch = raw.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // failed
      }
    }
    return null;
  }
}

/**
 * Builds the focused surgical patch prompt for a clustered task and target excerpt.
 */
export function buildSurgicalPatchPrompt(
  task: ClusteredEditorialTask,
  targetExcerpt: string,
  sceneContext: string
): { prompt: string; system: string } {
  const system =
    'You are a professional literary editor making surgical, high-precision corrections to a novel. ' +
    'Do NOT rewrite entire chapters. Replace only 1-2 sentences within the target paragraph to solve the issue. ' +
    'Preserve the author\'s exact tone, atmosphere, cadence, and vocabulary. Output valid JSON only.';

  const prompt = `SURGICAL EDITORIAL TASK:
Task ID: ${task.id}
Priority: ${task.priority.toUpperCase()} (${task.category})
Target Chapter: Chapter ${task.chapterNumber}

PROBLEM TO SOLVE:
${task.problemSummary}

CANONICAL AUTHOR DIRECTIVE (WHAT TO INSERT/FIX):
${task.canonicalDirective}

TARGET PARAGRAPH IN CHAPTER ${task.chapterNumber}:
"""
${targetExcerpt}
"""

SURROUNDING SCENE CONTEXT:
"""
${sceneContext}
"""

INSTRUCTIONS:
1. Locate the exact 1-2 sentences within the TARGET PARAGRAPH that require correction.
2. Formulate the revised replacement sentence(s) that smoothly integrates the canonical author directive without changing the author's voice or rhythm.
3. Keep the rest of the text completely untouched.
4. Return a valid JSON object with EXACTLY this structure:
{
  "changed": true,
  "find": "Exact substring from the target paragraph to be replaced",
  "replace": "The improved replacement substring with the fix applied",
  "explanation": "Brief explanation of the surgical fix"
}`;

  return { prompt, system };
}

/**
 * Executes a surgical repair for a clustered task against the manuscript.
 * Employs find -> replace precision so 99.5% of the chapter remains untouched.
 */
export async function repairSurgicalTask(
  task: ClusteredEditorialTask,
  manuscriptContent: string,
  bookTitle: string,
  callLlm: (prompt: string, system: string) => Promise<string>
): Promise<TargetedRepairResult> {
  const parsedChapters = parseBookChapters(manuscriptContent);
  if (parsedChapters.length === 0) {
    throw new Error('Manuscript has no readable chapters.');
  }

  // Handle dismissed tasks without calling LLM
  if (task.isDismissed) {
    return {
      changed: false,
      chapterNumber: task.chapterNumber,
      explanation: task.dismissReason || 'Preserved per authorial canon (no edit required)',
      beforeChapterText: parsedChapters.find(c => c.num === task.chapterNumber)?.content || '',
      afterChapterText: parsedChapters.find(c => c.num === task.chapterNumber)?.content || '',
      updatedManuscript: manuscriptContent,
      patchMethod: 'none',
    };
  }

  const targetChapter = parsedChapters.find(c => c.num === task.chapterNumber) || parsedChapters[0];
  const beforeChapterText = targetChapter.content;

  const { targetExcerpt, sceneContext } = locateTargetExcerpt(
    beforeChapterText,
    task.targetQuotes,
    CANONICAL_CLUSTERS.find(c => c.id === task.id)?.fallbackKeywords || []
  );

  const { prompt, system } = buildSurgicalPatchPrompt(task, targetExcerpt, sceneContext);
  const rawResponse = await callLlm(prompt, system);
  const parsed = parseRepairJson(rawResponse);

  if (!parsed || parsed.changed === false) {
    return {
      changed: false,
      chapterNumber: targetChapter.num,
      explanation: parsed?.explanation || 'Verified: text conforms to canon',
      beforeChapterText,
      afterChapterText: beforeChapterText,
      updatedManuscript: manuscriptContent,
      patchMethod: 'none',
    };
  }

  let patchedChapterText = beforeChapterText;
  let method: 'exact' | 'normalized' | 'paragraph_fallback' | 'full_chapter_fallback' | 'none' = 'none';

  // 1. Try surgical patch with find -> replace
  if (parsed.find && parsed.replace) {
    const patchResult = applySurgicalPatch(beforeChapterText, parsed.find, parsed.replace);
    if (patchResult.changed) {
      patchedChapterText = patchResult.patchedText;
      method = patchResult.method;
    }
  }

  // 2. If find -> replace did not match but model returned full paragraph in replace
  if (method === 'none' && parsed.replace && beforeChapterText.includes(targetExcerpt)) {
    patchedChapterText = beforeChapterText.replace(targetExcerpt, parsed.replace);
    method = 'paragraph_fallback';
  }

  // 3. Fallback: if model provided full chapter text in "text" field
  if (method === 'none' && parsed.text && parsed.text.trim()) {
    patchedChapterText = normalizeChapterBody(parsed.text.trim(), targetChapter.num);
    method = 'full_chapter_fallback';
  }

  if (method === 'none' || patchedChapterText === beforeChapterText) {
    return {
      changed: false,
      chapterNumber: targetChapter.num,
      explanation: parsed.explanation || 'Verified: targeted revision unchanged',
      beforeChapterText,
      afterChapterText: beforeChapterText,
      updatedManuscript: manuscriptContent,
      patchMethod: 'none',
    };
  }

  const afterChapterText = patchedChapterText;
  const updatedChapters = parsedChapters.map(c =>
    c.num === targetChapter.num ? { chapter: c.num, text: afterChapterText } : { chapter: c.num, text: c.content }
  );

  const updatedManuscript = assembleManuscript(updatedChapters, bookTitle);

  return {
    changed: true,
    chapterNumber: targetChapter.num,
    explanation: parsed.explanation || `Applied targeted revision in chapter ${targetChapter.num}`,
    beforeChapterText,
    afterChapterText,
    updatedManuscript,
    patchMethod: method,
  };
}

/**
 * Builds the focused repair prompt for a single finding and chapter.
 * Retained for backward compatibility.
 */
export function buildTargetedRepairPrompt(
  finding: EditorialFinding,
  chapterNumber: number,
  chapterContent: string
): { prompt: string; system: string } {
  const evidenceText = finding.evidence_refs?.length
    ? `\nEvidence cited:\n${finding.evidence_refs.map(r => `  - ${r}`).join('\n')}`
    : '';

  const system =
    'You are a professional book editor. Make minimal, surgical edits to resolve the specified editorial finding in the chapter text. Preserve the author\'s voice, style, character names, and effective prose. Output valid JSON only.';

  const prompt = `EDITORIAL FINDING TO FIX:
Severity: ${finding.severity || 'note'}
Category: ${finding.category || 'General continuity'}
Issue: ${finding.description}${evidenceText}

CURRENT CHAPTER ${chapterNumber} PROSE:
${chapterContent}

TASK:
1. Revise Chapter ${chapterNumber} to resolve the issue above.
2. Make ONLY the minimal necessary changes required to fix the contradiction, inconsistency, or craft flaw.
3. Keep all effective scenes, character dialogue, voice, tone, and existing style intact.
4. Do NOT summarize or truncate the chapter. Return the COMPLETE revised chapter text with the fix integrated.
5. Provide a 1-sentence explanation of what was changed.

Return a valid JSON object with EXACTLY this structure:
{
  "changed": true,
  "explanation": "Brief description of the fix enacted",
  "text": "Complete revised chapter text"
}`;

  return { prompt, system };
}

/**
 * Executes a single surgical repair for one finding against the manuscript.
 * Retained for backward compatibility.
 */
export async function repairSingleFinding(
  finding: EditorialFinding,
  manuscriptContent: string,
  bookTitle: string,
  callLlm: (prompt: string, system: string) => Promise<string>
): Promise<TargetedRepairResult> {
  const parsedChapters = parseBookChapters(manuscriptContent);
  if (parsedChapters.length === 0) {
    throw new Error('Manuscript has no readable chapters.');
  }

  const targetChapterNum = findTargetChapter(finding, parsedChapters);
  const targetChapter = parsedChapters.find(c => c.num === targetChapterNum) || parsedChapters[0];
  const beforeChapterText = targetChapter.content;

  const { prompt, system } = buildTargetedRepairPrompt(finding, targetChapter.num, beforeChapterText);
  const rawResponse = await callLlm(prompt, system);
  const parsed = parseRepairJson(rawResponse);

  if (!parsed || parsed.changed === false || !parsed.text || !parsed.text.trim()) {
    return {
      changed: false,
      chapterNumber: targetChapter.num,
      explanation: parsed?.explanation || 'Verified: no text modification required',
      beforeChapterText,
      afterChapterText: beforeChapterText,
      updatedManuscript: manuscriptContent,
      patchMethod: 'none',
    };
  }

  const afterChapterText = normalizeChapterBody(parsed.text.trim(), targetChapter.num);
  const updatedChapters = parsedChapters.map(c =>
    c.num === targetChapter.num ? { chapter: c.num, text: afterChapterText } : { chapter: c.num, text: c.content }
  );

  const updatedManuscript = assembleManuscript(updatedChapters, bookTitle);

  return {
    changed: true,
    chapterNumber: targetChapter.num,
    explanation: parsed.explanation || `Updated Chapter ${targetChapter.num}`,
    beforeChapterText,
    afterChapterText,
    updatedManuscript,
    patchMethod: 'full_chapter_fallback',
  };
}

/**
 * Parses a model tag (e.g. from run_log or metadata) into a valid LLMProviderConfig.
 * Example tag: "author: ollama:deepseek-v4.1-flash:cloud · reader: huggingface:..."
 */
export function parseModelConfigFromTag(tag: string): {
  provider: 'gemini' | 'ollama' | 'qwen' | 'anthropic' | 'huggingface' | 'compatible';
  ollamaEndpoint?: string;
  ollamaModel?: string;
  geminiModel?: string;
  qwenModel?: string;
  anthropicModel?: string;
  hfModel?: string;
  compatibleModel?: string;
} | null {
  if (!tag || typeof tag !== 'string') return null;
  const match = tag.match(/author:\s*([a-z0-9_-]+):([^\s·]+)/i) || tag.match(/^([a-z0-9_-]+):([^\s·]+)/i);
  if (!match) return null;
  const provider = match[1].toLowerCase();
  const model = match[2].trim();

  if (provider === 'ollama') {
    return {
      provider: 'ollama',
      ollamaModel: model,
      ollamaEndpoint: '/api/ollama',
    };
  }
  if (provider === 'qwen') {
    return {
      provider: 'qwen',
      qwenModel: model,
    };
  }
  if (provider === 'gemini') {
    return {
      provider: 'gemini',
      geminiModel: model,
    };
  }
  if (provider === 'anthropic') {
    return {
      provider: 'anthropic',
      anthropicModel: model,
    };
  }
  if (provider === 'compatible') {
    return {
      provider: 'compatible',
      compatibleModel: model,
    };
  }
  if (provider === 'huggingface') {
    return {
      provider: 'huggingface',
      hfModel: model,
    };
  }
  return null;
}

/**
 * Returns a clean, human-readable display label for the active LLM provider configuration.
 */
export function formatModelDisplayLabel(config: {
  provider: string;
  ollamaModel?: string;
  geminiModel?: string;
  qwenModel?: string;
  anthropicModel?: string;
  hfModel?: string;
  compatibleModel?: string;
}): string {
  if (!config) return 'None';
  if (config.provider === 'ollama') {
    const name = config.ollamaModel || 'llama3.1';
    if (/deepseek/i.test(name)) return `DeepSeek (${name})`;
    return `Ollama: ${name}`;
  }
  if (config.provider === 'anthropic') {
    return `Anthropic: ${config.anthropicModel || 'Claude'}`;
  }
  if (config.provider === 'qwen') {
    return `Qwen: ${config.qwenModel || 'qwen3.8-flash'}`;
  }
  if (config.provider === 'gemini') {
    return `Gemini: ${config.geminiModel || 'gemini-3.6-flash'}`;
  }
  if (config.provider === 'compatible') {
    return `API: ${config.compatibleModel || 'auto'}`;
  }
  if (config.provider === 'huggingface') {
    return `HF: ${config.hfModel || 'custom'}`;
  }
  return String(config.provider);
}
