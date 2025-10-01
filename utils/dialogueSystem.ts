/**
 * Dialogue system for creating distinct character voices
 */

import { Character } from '../types';

export interface CharacterVoiceProfile {
  name: string;
  speechPatterns: string[];
  vocabularyLevel: string; // formal, casual, street, academic, archaic
  emotionalRange: string; // reserved, expressive, volatile, stoic
  catchphrases?: string[];
  dialectNotes?: string;
  communicationStyle: string; // direct, indirect, verbose, terse, poetic
}

/**
 * Generate a voice profile for a character based on their description
 */
export function generateVoiceProfile(character: Character): CharacterVoiceProfile {
  const description = character.description.toLowerCase();
  
  // Infer vocabulary level
  let vocabularyLevel = 'casual';
  if (description.includes('noble') || description.includes('educated') || description.includes('scholar')) {
    vocabularyLevel = 'formal';
  } else if (description.includes('street') || description.includes('thief') || description.includes('rogue')) {
    vocabularyLevel = 'street';
  } else if (description.includes('ancient') || description.includes('old') || description.includes('elder')) {
    vocabularyLevel = 'archaic';
  }
  
  // Infer emotional range
  let emotionalRange = 'expressive';
  if (description.includes('stoic') || description.includes('calm') || description.includes('reserved')) {
    emotionalRange = 'reserved';
  } else if (description.includes('hot-headed') || description.includes('impulsive') || description.includes('passionate')) {
    emotionalRange = 'volatile';
  }
  
  // Infer communication style
  let communicationStyle = 'direct';
  if (description.includes('poet') || description.includes('bard') || description.includes('artist')) {
    communicationStyle = 'poetic';
  } else if (description.includes('blunt') || description.includes('soldier') || description.includes('warrior')) {
    communicationStyle = 'terse';
  } else if (description.includes('politician') || description.includes('diplomat')) {
    communicationStyle = 'indirect';
  } else if (description.includes('scholar') || description.includes('professor')) {
    communicationStyle = 'verbose';
  }
  
  return {
    name: character.name,
    speechPatterns: [],
    vocabularyLevel,
    emotionalRange,
    communicationStyle
  };
}

/**
 * Get dialogue guidelines for a character based on their voice profile
 */
export function getDialogueGuidelines(profile: CharacterVoiceProfile): string {
  let guidelines = `\n**DIALOGUE VOICE FOR ${profile.name.toUpperCase()}:**\n`;
  
  // Vocabulary level guidance
  switch (profile.vocabularyLevel) {
    case 'formal':
      guidelines += `- Uses formal, educated language\n- Complete sentences, proper grammar\n- May use complex vocabulary\n- Avoids contractions and slang\n`;
      break;
    case 'street':
      guidelines += `- Uses casual, street-level language\n- Contractions and slang common\n- May drop words or use fragments\n- Colorful, direct expressions\n`;
      break;
    case 'archaic':
      guidelines += `- Uses older, more formal speech patterns\n- May use "thee/thou" or outdated terms\n- Speaks with dignity and formality\n- References to old ways and traditions\n`;
      break;
    case 'academic':
      guidelines += `- Uses precise, technical language\n- May over-explain or lecture\n- References to studies and theories\n- Analytical and measured\n`;
      break;
    default: // casual
      guidelines += `- Uses everyday, conversational language\n- Mix of contractions and full words\n- Natural, relaxed speech\n- Accessible vocabulary\n`;
  }
  
  // Communication style guidance
  switch (profile.communicationStyle) {
    case 'terse':
      guidelines += `- Short sentences, few words\n- Gets to the point quickly\n- May use sentence fragments\n- No unnecessary elaboration\n`;
      break;
    case 'verbose':
      guidelines += `- Longer, more complex sentences\n- Provides context and explanation\n- May over-explain or digress\n- Enjoys the sound of their own voice\n`;
      break;
    case 'poetic':
      guidelines += `- Uses metaphor and imagery\n- Rhythmic, musical language\n- May speak in riddles or allusions\n- Beauty in expression matters\n`;
      break;
    case 'indirect':
      guidelines += `- Implies rather than states directly\n- Uses euphemisms and careful phrasing\n- Diplomatic and tactful\n- Leaves room for interpretation\n`;
      break;
    default: // direct
      guidelines += `- Says what they mean clearly\n- Straightforward and honest\n- No beating around the bush\n- Values clarity over tact\n`;
  }
  
  // Emotional range guidance
  switch (profile.emotionalRange) {
    case 'reserved':
      guidelines += `- Emotions are subtle, controlled\n- Rarely raises voice or shows strong feeling\n- Maintains composure\n- Feelings shown through small gestures\n`;
      break;
    case 'volatile':
      guidelines += `- Emotions are immediate and intense\n- May shout, interrupt, or react strongly\n- Wears heart on sleeve\n- Quick to anger or joy\n`;
      break;
    case 'stoic':
      guidelines += `- Shows minimal emotion\n- Speaks calmly even in crisis\n- Feelings are deeply buried\n- Actions speak louder than words\n`;
      break;
    default: // expressive
      guidelines += `- Emotions are clear and genuine\n- Shows feelings appropriately\n- Balanced emotional responses\n- Authentic and relatable\n`;
  }
  
  if (profile.catchphrases && profile.catchphrases.length > 0) {
    guidelines += `\n**CATCHPHRASES/SIGNATURE EXPRESSIONS:**\n${profile.catchphrases.map(p => `- "${p}"`).join('\n')}\n`;
  }
  
  if (profile.dialectNotes) {
    guidelines += `\n**DIALECT/ACCENT NOTES:** ${profile.dialectNotes}\n`;
  }
  
  return guidelines;
}

/**
 * Get dialogue guidelines for all characters in a scene
 */
export function getSceneDialogueGuidelines(characters: Record<string, Character>): string {
  let guidelines = "\n**CHARACTER VOICE GUIDELINES:**\n";
  
  for (const character of Object.values(characters)) {
    const profile = generateVoiceProfile(character);
    guidelines += getDialogueGuidelines(profile);
    guidelines += "\n";
  }
  
  guidelines += `\n**DIALOGUE CONTRAST:**
Make sure each character sounds DISTINCT from the others. Their speech patterns, word choices, and rhythms should be immediately recognizable. Readers should be able to identify who's speaking even without dialogue tags.\n`;
  
  return guidelines;
}
