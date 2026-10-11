const string = { type: 'string', minLength: 1 };
const strings = { type: 'array', items: string };
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const thesisPlanSchema = object({
  title: string, premise_givens: strings,
  canon: object({facts:{type:"array",minItems:1,items:object({id:string,truth:string,established_in:string,knowledge:{type:"array",items:object({character_id:string,learned_in:string})}})}}),
  characters: { type: 'array', minItems: 1, items: object({ id: string, name: string, goal: string, initial_knowledge: strings, capabilities: strings, limitations: strings }) },
  theses: { type: 'array', minItems: 1, items: object({
    id: string, chapter: { type: 'integer', minimum: 1 }, pov_id: string,
    participants: { type: 'array', minItems: 1, items: object({ character_id: string, intention: string, knows: strings, believes: strings, does: string }) },
    when: string, where: string, state_before: string, action: string, why: string, resistance: string, outcome: string, beneath: string, place: string,
    needs_things: { type: 'array', items: object({ thing: string, at: string }) }, needs_knowledge: { type: 'array', items: object({ who: string, fact: string }) }, moves: { type: 'array', items: object({ thing: string, to: string }) },
    fact_ids: strings, establishes: strings, reader_learns: strings, requires: strings, writer_task: string, target_words: { type: 'integer', minimum: 1 },
  }) }, ending: string,
});

// The things whose whereabouts are accounted for scene by scene. Asked of every new plan;
// a plan without them is still read, and falls back to the review's own state trace.
(thesisPlanSchema.properties as Record<string, unknown>).tracked = { type: 'array', minItems: 3, maxItems: 10, items: object({ id: string, name: string, start: string, at: string }) };
(thesisPlanSchema.properties as Record<string, unknown>).places = { type: 'array', minItems: 1, items: object({ id: string, name: string }) };
(thesisPlanSchema.properties as Record<string, unknown>).ending_rests_on = strings;
(thesisPlanSchema.required as string[]).push('places', 'ending_rests_on');
(thesisPlanSchema.required as string[]).push('tracked');
// When the reader is given each fact. Asked for, not demanded: a fact without it is not followed for the reader.
((thesisPlanSchema.properties.canon as any).properties.facts.items.properties as Record<string, unknown>).reader_learns_in = string;
