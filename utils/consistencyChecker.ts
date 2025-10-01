import { Character } from '../types';

/**
 * Consistency checker for maintaining story coherence across chapters
 */

export interface ConsistencyIssue {
  type: 'character_name' | 'location' | 'timeline' | 'character_trait' | 'world_rule';
  severity: 'minor' | 'major' | 'critical';
  description: string;
  suggestion?: string;
}

export interface ConsistencyCheckResult {
  passed: boolean;
  issues: ConsistencyIssue[];
  warnings: string[];
}

/**
 * Check if chapter content maintains consistency with established facts
 */
export async function checkChapterConsistency(
  chapterContent: string,
  chapterNumber: number,
  characters: Record<string, Character>,
  previousChaptersSummaries: string,
  worldName: string,
  llmFunction: (prompt: string, system: string, schema?: object, temp?: number, topP?: number, topK?: number) => Promise<string>
): Promise<ConsistencyCheckResult> {
  
  const characterNames = Object.keys(characters);
  const characterDescriptions = Object.values(characters).map(c => 
    `${c.name}: ${c.description.substring(0, 200)}`
  ).join('\n');

  const consistencyPrompt = `You are a meticulous story continuity checker. Analyze the provided chapter for consistency issues.

**ESTABLISHED FACTS:**
- **World Name:** ${worldName}
- **Known Characters:** ${characterNames.join(', ')}
- **Character Details:**
${characterDescriptions}

**PREVIOUS CHAPTERS CONTEXT:**
${previousChaptersSummaries || 'This is the first chapter.'}

**CHAPTER ${chapterNumber} TO CHECK:**
${chapterContent.substring(0, 5000)} ${chapterContent.length > 5000 ? '...(truncated)' : ''}

**CHECK FOR THESE CONSISTENCY ISSUES:**
1. **Character Names:** Are all character names spelled consistently? Do new characters appear without introduction?
2. **Character Traits:** Do characters act consistently with their established personality?
3. **Locations:** Are location names consistent? Do characters teleport without explanation?
4. **Timeline:** Does the timeline make sense? Are there temporal contradictions?
5. **World Rules:** Are established world rules (magic systems, technology, etc.) maintained?

**RESPOND WITH:**
- List any consistency issues found (be specific with quotes if possible)
- Classify each issue as: MINOR (stylistic), MAJOR (noticeable error), or CRITICAL (breaks story logic)
- If no issues found, respond with "CONSISTENCY CHECK PASSED"

Be thorough but fair. Minor stylistic variations are acceptable. Focus on factual contradictions.`;

  const systemPrompt = "You are an expert story editor specializing in continuity and consistency.";

  try {
    const response = await llmFunction(consistencyPrompt, systemPrompt, undefined, 0.2, 0.6, 10);
    
    // Parse response
    const issues: ConsistencyIssue[] = [];
    const warnings: string[] = [];
    
    if (response.includes("CONSISTENCY CHECK PASSED")) {
      return { passed: true, issues: [], warnings: [] };
    }

    // Simple parsing of issues (in production, use structured output)
    const lines = response.split('\n');
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      if (lowerLine.includes('critical')) {
        issues.push({
          type: 'character_name',
          severity: 'critical',
          description: line.trim()
        });
      } else if (lowerLine.includes('major')) {
        issues.push({
          type: 'character_name',
          severity: 'major',
          description: line.trim()
        });
      } else if (lowerLine.includes('minor')) {
        warnings.push(line.trim());
      }
    }

    return {
      passed: issues.filter(i => i.severity === 'critical').length === 0,
      issues,
      warnings
    };

  } catch (error) {
    console.warn('Consistency check failed:', error);
    // Don't block generation on consistency check failure
    return { passed: true, issues: [], warnings: ['Consistency check could not be performed'] };
  }
}

/**
 * Validate character names are consistent throughout the chapter
 */
export function validateCharacterNames(
  chapterContent: string,
  knownCharacters: Record<string, Character>
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const characterNames = Object.keys(knownCharacters);
  
  // Check for common misspellings or variations
  for (const name of characterNames) {
    const nameParts = name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
    
    // Check if first name appears without last name inconsistently
    const firstNameCount = (chapterContent.match(new RegExp(`\\b${firstName}\\b`, 'g')) || []).length;
    const fullNameCount = (chapterContent.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
    
    // This is just a basic check - in production you'd want more sophisticated analysis
    if (firstNameCount > 0 && fullNameCount === 0 && nameParts.length > 1) {
      issues.push({
        type: 'character_name',
        severity: 'minor',
        description: `Character "${name}" is referred to only by first name "${firstName}" in this chapter. Ensure this is intentional.`,
        suggestion: `Consider using full name "${name}" at least once for clarity.`
      });
    }
  }
  
  return issues;
}

/**
 * Check for timeline consistency
 */
export function validateTimeline(
  currentChapterTime: string,
  previousChapterTime: string
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  
  // Basic timeline validation
  // In production, you'd parse actual dates/times and compare
  if (currentChapterTime && previousChapterTime) {
    if (currentChapterTime === previousChapterTime) {
      issues.push({
        type: 'timeline',
        severity: 'minor',
        description: `Chapter ends at the same time as previous chapter: "${currentChapterTime}". Verify this is correct.`
      });
    }
  }
  
  return issues;
}
