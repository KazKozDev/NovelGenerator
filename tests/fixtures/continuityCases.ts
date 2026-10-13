import type { ContinuityCase, ContinuityVerdict } from '../../utils/novel/v3/continuityEval';

const pair = (id: string, category: string, expected: ContinuityVerdict, first: string, second: string, rationale: string): ContinuityCase =>
  ({ id, category, expected, passages: [{ id: 'A', text: first }, { id: 'B', text: second }], rationale });

/** Human-labelled controls. Expected labels and explanations are never sent to the judge. */
export const continuityCases: ContinuityCase[] = [
  pair('lie-admitted', 'lie', 'explained', 'Nora left the hotel at five forty on Thursday. On Friday she told Vega, "I last saw him on Monday."',
    '"I lied yesterday," Nora told Vega. "I was with him on Thursday and left at five forty."', 'A later admission explains the false alibi.'),
  pair('lie-unsupported', 'uncertainty', 'uncertain', 'Nora left the hotel at five forty on Thursday.',
    'On Friday Nora told Vega, "I last saw him on Monday."', 'Speech conflicts with the event, but the excerpt does not establish deception or an author error.'),
  pair('narrated-time', 'time', 'error', 'Nora left the hotel at exactly 2:20 p.m. on May 16. The lobby clock was accurate.',
    'Nora left the hotel at exactly 2:40 p.m. on May 16. It was her only departure from the hotel that day.', 'Both objective departure times refer to the same unique event.'),
  pair('body-location', 'location', 'error', 'At noon the only corpse was in room 412. It remained there, untouched, until one.',
    'At twelve thirty the same corpse was in the garage. Nobody had moved it.', 'Same corpse and overlapping times, with movement excluded.'),
  pair('object-moved', 'transition', 'explained', 'Nora left the scarf on the chair at noon.',
    'At one Claire took the scarf from the chair and put it in her bag. At two the scarf was in her bag.', 'The transfer is shown.'),
  pair('similar-objects', 'identity', 'explained', 'Nora owned a gray scarf with a blue stitched edge. Claire owned an identical gray scarf with a red stitched edge.',
    'The scarf with the blue edge stayed in Nora\'s closet. Claire left the scarf with the red edge in room 412.', 'The scarves have distinct established identities.'),
  pair('duplicate-invented', 'identity', 'error', 'There was only one key to the safe. At noon it was locked in the evidence box, which stayed sealed until evening.',
    'At one Nora used that very key to open the safe. The evidence box was still sealed, and there was no copy.', 'A second key cannot be invented to explain this.'),
  pair('intentional-coincidence', 'coincidence', 'explained', 'Nora and Claire each booked a Thursday appointment at two, independently, without knowing about the other booking.',
    'Their appointments happened at the same hour in different offices. Neither had arranged the coincidence.', 'Coinciding times are compatible events.'),
  pair('revelation', 'revelation', 'explained', 'Nora saw a man in Daniel\'s coat and assumed it was Daniel. She could not see his face.',
    'The man was Paul. He had borrowed Daniel\'s coat that morning. Nora recognized Paul when he turned around.', 'An explicit mistaken identification is corrected.'),
  pair('document-forged', 'document', 'explained', 'The letter stated that Nora had sold the house on Monday.',
    'Claire had forged the letter and Nora\'s signature. Nora still owned the house on Tuesday.', 'The document is explicitly false.'),
  pair('first-person-unresolved', 'narrator', 'uncertain', 'I remembered leaving the scarf on the chair. I could not remember anything after that.',
    'The scarf was in my bag when I arrived home. I did not know how it got there.', 'Incomplete memory leaves the transfer unresolved.'),
  pair('first-person-established', 'narrator', 'error', 'I left at exactly two on Thursday. That was my only departure; I checked the synchronized clock.',
    'I left at exactly three that same Thursday. That was my only departure; I checked the same synchronized clock.', 'First person alone does not justify inventing an unreliable narrator.'),
  pair('new-day', 'transition', 'explained', 'On Monday Nora was in Madrid.',
    'Nora flew to Paris on Tuesday. On Wednesday she was in Paris.', 'Different days and explicit travel.'),
  pair('knowledge', 'knowledge', 'error', 'Until noon on Friday nobody had told Nora the code, and she had never seen, guessed or used it.',
    'At ten on Friday Nora remembered using that code on Thursday, when she already knew it.', 'An explicitly excluded earlier knowledge is asserted.'),
  { id: 'nora-alibi-admitted', category: 'saved-book', expected: 'explained', rationale: 'Nora explicitly admits lying about her last meeting; her speech is not objective chronology.', passages: [
    { id: 'ch4-departure', text: 'She left at five forty. She was home by six fifteen. Grant was at the counter with the mail in two piles. *How was the office,* he said, and she said, *Long,* and he said, *There\'s wine,* and she said, *Good,* and she went upstairs and stood in the bathroom with the tap running and turned her wedding ring around her finger, and she did not tell him, because telling him was not in the arrangement, and the arrangement was the only wall she had left.' },
    { id: 'ch4-alibi', text: '*And you saw him last —*\n\n*Monday,* Nora said. *The joint session. Two o\'clock.*' },
    { id: 'ch5-admission', text: '*Because I lied,* Nora said. *Because I\'ve been lying since October, and the man who died was my patient, and I was in that room on Thursday at four o\'clock, and I left at five forty, and I have no way to prove I wasn\'t there at nine forty, and I know that, and she knows that, and she\'s known it since the first Monday she sat in my waiting room.*' },
  ] },
  // Verbatim excerpt from runs/nora-truth1/chapter-3.md, paragraph beginning "She should have waited".
  { id: 'nora-scarf-same-paragraph', category: 'saved-book', expected: 'error', rationale: 'The same narrated departure takes and leaves the scarf, with no intervening action.', passages: [{ id: 'ch3', text:
    'She should have waited. That was the thing she would go over and over, for the rest of her life, lying awake in the dark: she should have waited. But she did not wait. She felt, suddenly, that if she stayed another minute in that room with its arranged smell and its little dish of sachets she would begin to scream, and so she took her bag and her scarf from the chair and went out into the corridor and down the stairs and out onto Broad Street, where the light was ordinary and the heat was ordinary and a carriage horse stood patient at the corner with its head down, and she walked away from The Rutledge fast, without looking back, and she did not notice that her scarf was not in her hand, that she had left it on the chair, that she had, without knowing it, done the thing Claire had said she would do.' }] },
];
