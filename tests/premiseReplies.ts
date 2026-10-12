/** Clean answers for the two premise checks a planning_version 2 outline receives. */
export const premiseReply = (options: any): string | undefined =>
  options?.stage === 'thesis-plan-stress' || options?.stage === 'thesis-plan-dryrun' ? JSON.stringify({ ready: true, issues: [] })
  : options?.stage === 'thesis-premise-coverage' ? JSON.stringify({ coverage: Array.from({ length: options.schema.properties.coverage.minItems }, (_, given) => ({
      given, kind: 'story', thesis_id: options.schema.properties.coverage.items.properties.thesis_id.enum[0], field: 'action', note: 'Played as the scene action' })) })
  : options?.stage === 'thesis-habits' ? JSON.stringify({ habits: [] })
  : options?.stage === 'thesis-voice-opponent' ? JSON.stringify({ who: 'Ann', protagonist: 'Jo', i_want: 'The house', i_know: 'Where the letter is', my_steps: [1, 2, 3].map(n => ({ where: 'Study', i_do: `Step ${n}`, she_could_see: `Trace ${n}` })), i_count_on: 'Her silence', if_she_does_not: 'I wait', the_easier_way: 'Ask; she would refuse', what_i_cannot_control: 'The letter' })
  : options?.stage === 'thesis-voice-protagonist' ? JSON.stringify({ who: 'Jo', i_stand_to_lose: 'The house', my_moves: [1, 2, 3].map(n => ({ after: n, where: 'Hall', i_do: `Move ${n}`, because: 'I think so', it_costs: 'Time' })), the_thing_they_did_not_expect: 'I open it', my_last_stand: { where: 'Study', against: 'Ann', i_do: 'I read it aloud', i_pay: 'The house' } })
  : options?.stage === 'thesis-scene-voices' ? JSON.stringify({ voices: [] })
  : options?.stage === 'thesis-record' ? JSON.stringify({ day: 'The same night', facts: [{ about: 'Jo', fact: 'Is addressed as Ms. Hale' }], shown: ['The drawer and its lock'] })
  : options?.stage === 'thesis-spine' ? JSON.stringify({ in_two_sentences: 'Jo opens a letter and it costs her.', ending: 'It ends', turns: [1, 2, 3].map(n => ({ who: 'Jo', does: `Acts ${n}`, because: 'She must', costs: 'A door closes' })), deeds: [], proofs: [],
      first_question: { asked_by: 'A neighbour', question: 'Why now?', answer: 'Because of the letter' }, chapters: Array.from({ length: 12 }, (_, at) => ({ chapter: at + 1, events: [{ where: 'Study', what: 'Jo acts' }], worse_because: 'More is at risk' })) })
  : undefined;
