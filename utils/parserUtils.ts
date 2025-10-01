import { Character } from '../types';
import { generateGeminiText } from '../services/geminiService';


// Helper for Python-like re.findall for specific character pattern
function findCharacterMatches(text: string): Array<[string, string]> {
  const pattern = /([A-Z][A-Za-z\s\-'.]+):\s+([^\n]+)/g;
  const matches: Array<[string, string]> = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    matches.push([match[1].trim(), match[2].trim()]);
  }
  return matches;
}

export async function extractCharactersFromString(
  outlineText: string, 
  llmFallback: typeof generateGeminiText
): Promise<Record<string, Character>> {
  const characters: Record<string, Character> = {};
  
  const charSectionMatch = outlineText.match(/MAIN CHARACTERS\s*\n(.*?)(?=\n\n[A-Z\s]+:|$)/is);
  let characterDetailsText = "";

  if (charSectionMatch && charSectionMatch[1]) {
    const characterTextFromOutline = charSectionMatch[1];
    const charPrompt = `From the 'MAIN CHARACTERS' section below, extract each character's details.

${characterTextFromOutline}

For EACH character, format as:
CHARACTER NAME: Detailed physical description, core personality traits, primary motivation, overall character arc, role, connections.

Include all characters mentioned (protagonist, antagonist, supporting).`;
    characterDetailsText = await llmFallback(charPrompt, "You are a data extraction assistant.");
  } else {
     // Fallback: Try to extract from the whole outline if section is missing
    const charPromptFallback = `Based on this story outline, create a detailed character guide:

${outlineText}

For EACH character clearly mentioned with a description, format as:
CHARACTER NAME: Brief description, role in story, key personality traits, motivation, background (if available in outline).

Include protagonist, antagonist, and key supporting characters.`;
    characterDetailsText = await llmFallback(charPromptFallback, "You are a data extraction assistant.");
  }

  if (characterDetailsText) {
    const matches = findCharacterMatches(characterDetailsText);
    for (const match of matches) {
      const name = match[0];
      const description = match[1];
      characters[name] = {
        name,
        description,
        first_appearance: 0,
        status: "unknown",
        development: [],
        relationships: {},
        location: "unknown",
        emotional_state: "unknown",
      };
    }
  }
  return characters;
}

export async function extractWorldNameFromString(
  outlineText: string,
  llmFallback: typeof generateGeminiText
): Promise<string> {
  const patterns = [
    /Neo-[A-Za-z]+/g,
    /[A-Z][a-z]+land/g,
    /[A-Z][a-z]+ Kingdom/g,
    /[A-Z][a-z]+ Empire/g,
    /[A-Z][a-z]+ Realm/g,
    /[A-Z][a-z]+ World/g,
    /[A-Z][a-z]+ City/g,
  ];
  
  const foundNames: string[] = [];
  for (const pattern of patterns) {
    const matches = outlineText.match(pattern);
    if (matches) {
      foundNames.push(...matches);
    }
  }
  
  if (foundNames.length > 0) {
    const counts: Record<string, number> = {};
    for (const name of foundNames) {
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  }
  
  // Fallback using regex for specific section
  const worldNameMatch = outlineText.match(/WORLD BUILDING DETAILS\s*\n1.\s*The name of the main world\/city\/setting:\s*([^\n]+)/i);
  if (worldNameMatch && worldNameMatch[1]) {
    return worldNameMatch[1].trim();
  }

  // LLM fallback if regex fails
  const worldPrompt = `Based on this story outline, what is the primary name for the main world/city/setting?

${outlineText}

Reply with ONLY the world name, nothing else.`;
  const llmName = await llmFallback(worldPrompt, "You are a data extraction assistant.");
  return llmName.trim();
}

export async function extractMotifsFromString(
  outlineText: string,
  llmFallback: typeof generateGeminiText
): Promise<string[]> {
  const motifMatch = outlineText.match(/RECURRING MOTIFS\/THEMES\s*\n(.*?)(?=\n\n[A-Z\s]+:|$)/is);
  if (motifMatch && motifMatch[1]) {
    return motifMatch[1].split('\n')
      .map(motif => motif.trim().replace(/^[*-]\s*/, ''))
      .filter(motif => motif.length > 0);
  }

  // LLM fallback
  const motifPrompt = `Based on this story outline, identify 3-5 recurring motifs, symbols, objects, or core themes:
${outlineText}
Format as a simple list, one item per line.
These should be concrete elements or clear themes that can recur or be referenced.`;
  const motifsTextFallback = await llmFallback(motifPrompt, "You are a literary analyst.");
  if (motifsTextFallback) {
    return motifsTextFallback.split('\n').map(motif => motif.trim()).filter(motif => motif.length > 0);
  }
  return [];
}
