// Few-shot examples for "Show, Don't Tell" principle
// These examples demonstrate high-quality prose techniques

export const SHOW_DONT_TELL_EXAMPLES = `
**EXAMPLE 1 - Showing Anger:**
❌ TELL: "Sarah was angry at her brother."
✅ SHOW: "Sarah's knuckles whitened around the coffee mug. 'Get out,' she said, each word clipped and cold."

**EXAMPLE 2 - Showing Fear:**
❌ TELL: "Marcus felt afraid as he entered the dark house."
✅ SHOW: "Marcus's hand trembled on the doorknob. The house exhaled stale air. He stepped inside, pulse hammering in his throat."

**EXAMPLE 3 - Showing Love:**
❌ TELL: "They were deeply in love."
✅ SHOW: "He memorized the way she laughed—head tilted back, eyes closed, completely unguarded. He'd never felt safer."

**EXAMPLE 4 - Showing Exhaustion:**
❌ TELL: "She was exhausted after the long day."
✅ SHOW: "Her eyelids dragged like lead curtains. The couch called to her, but even sitting felt like too much effort."
`;

export const DIALOGUE_EXAMPLES = `
**EXAMPLE 1 - Subtext in Dialogue:**
❌ WEAK: "I'm angry at you because you forgot our anniversary," she said angrily.
✅ STRONG: "It's fine," she said, not looking up from her phone. "Really. I'm sure the game was important."

**EXAMPLE 2 - Character Voice:**
❌ GENERIC: "We need to leave immediately," the soldier said.
✅ DISTINCT: "We move. Now." Captain Hayes didn't wait for acknowledgment. She never did.

**EXAMPLE 3 - Conflict Through Dialogue:**
❌ EXPOSITION: "You always do this! You never listen to me and it makes me feel unimportant!"
✅ TENSION: "When's the last time you asked about my day?" 
"I—yesterday, I think—"
"You think." She grabbed her keys. "That's the problem."
`;

export const ACTION_EXAMPLES = `
**EXAMPLE 1 - Tight Action Sequence:**
❌ VERBOSE: "He quickly moved his hand toward his weapon and grabbed it, then he aimed it at the approaching figure and prepared to fire."
✅ ECONOMICAL: "He drew. Aimed. The figure froze."

**EXAMPLE 2 - Sensory Details:**
❌ GENERIC: "The fight was intense and violent."
✅ SPECIFIC: "Knuckles met jaw. Bone cracked. The metallic taste of blood filled his mouth."
`;

export const NEGATIVE_EXAMPLES = `
**WHAT TO AVOID - COMMON MISTAKES:**

❌ **MISTAKE 1 - Telling emotions:**
"John was nervous and scared as he walked into the dark room."
✅ **BETTER:** "John's hand shook as he reached for the light switch. The darkness pressed against him."

❌ **MISTAKE 2 - Redundant adverbs:**
"She ran quickly to the door and opened it hurriedly."
✅ **BETTER:** "She sprinted to the door and yanked it open."

❌ **MISTAKE 3 - Exposition in dialogue:**
"As you know, John, we've been friends for ten years and you work as a detective."
✅ **BETTER:** "Ten years of friendship, and you still won't tell me what case you're working on."

❌ **MISTAKE 4 - Over-explaining:**
"She smiled because she was happy to see him after being apart for so long."
✅ **BETTER:** "She smiled. Three months felt like three years."

❌ **MISTAKE 5 - Weak verbs + adverbs:**
"He walked slowly and tiredly down the street."
✅ **BETTER:** "He trudged down the street."

❌ **MISTAKE 6 - Purple prose:**
"The magnificently resplendent sun cascaded its golden luminescence across the verdant landscape."
✅ **BETTER:** "Sunlight spilled across the green hills."

❌ **MISTAKE 7 - Filtering (unnecessary POV words):**
"She saw him enter the room. She heard the door close. She felt her heart race."
✅ **BETTER:** "He entered. The door clicked shut. Her heart hammered."

❌ **MISTAKE 8 - Stacked metaphors (CRITICAL):**
"Her heart was a drum beating against the cage of her ribs while storms of emotion crashed through the ocean of her soul."
✅ **BETTER:** "Her heart pounded. She couldn't breathe."

❌ **MISTAKE 9 - Overwritten descriptions:**
"The ancient, weathered, time-worn door creaked open with a haunting, eerie, spine-chilling sound."
✅ **BETTER:** "The old door creaked open."

❌ **MISTAKE 10 - Too many adjectives:**
"The tall, dark, mysterious, handsome stranger walked into the crowded, noisy, bustling tavern."
✅ **BETTER:** "A stranger walked into the tavern. Dark coat. Quiet eyes."
`;

export const WRITING_PRINCIPLES_SUMMARY = `
**CORE PRINCIPLES:**
1. **Show emotions through actions, not labels** - Never write "he was sad" when you can show tears, slumped shoulders, or a trembling voice.
2. **Cut ruthlessly** - If a word doesn't advance plot, reveal character, or build atmosphere, delete it.
3. **Trust your reader** - They can infer. They can read subtext. Don't explain everything.
4. **Vary rhythm** - Short sentences create urgency. Longer ones immerse and reflect. Use both deliberately.
5. **Make every line of dialogue earn its place** - It should reveal character, advance plot, or increase tension. Preferably all three.
6. **Avoid filtering** - Cut "she saw", "he heard", "she felt" when possible. Just show what's happening.
7. **Strong verbs over adverbs** - "sprinted" beats "ran quickly", "whispered" beats "said quietly".
8. **ONE metaphor per paragraph maximum** - Metaphors are spices, not the meal. Use sparingly.
9. **Limit adjectives to 1-2 per noun** - "The old door" not "The ancient, weathered, time-worn door".
10. **Simple language beats fancy language** - "Use" beats "utilize". "Help" beats "facilitate". Clear beats clever.
`;

export function getWritingExamplesPrompt(): string {
  return `
${SHOW_DONT_TELL_EXAMPLES}

${DIALOGUE_EXAMPLES}

${ACTION_EXAMPLES}

${NEGATIVE_EXAMPLES}

${WRITING_PRINCIPLES_SUMMARY}

Study these examples carefully. Learn from both the good examples AND the mistakes to avoid. Apply these principles to your writing.
`;
}
