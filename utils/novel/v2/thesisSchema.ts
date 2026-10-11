const string = { type: 'string', minLength: 1 };
const strings = { type: 'array', items: string };
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const thesisPlanSchema = object({
  title: string, premise_givens: strings,
  canon: object({facts:{type:"array",minItems:1,items:object({id:string,truth:string,established_in:string,knowledge:{type:"array",items:object({character_id:string,learned_in:string})}})}}),
  characters: { type: 'array', minItems: 1, items: object({ id: string, name: string, goal: string, initial_knowledge: strings, capabilities: strings, limitations: strings }) },
  theses: { type: 'array', minItems: 1, items: object({
    id: string, chapter: { type: 'integer', minimum: 1 }, pov_id: string,
    participants: { type: 'array', minItems: 1, items: object({ character_id: string, intention: string, knows: strings, does: string }) },
    when: string, where: string, state_before: string, action: string, why: string, resistance: string, outcome: string,
    fact_ids: strings, establishes: strings, reader_learns: strings, requires: strings, writer_task: string, target_words: { type: 'integer', minimum: 1 },
  }) }, ending: string,
});

// The things whose whereabouts are accounted for scene by scene. Asked of every new plan;
// a plan without them is still read, and falls back to the review's own state trace.
(thesisPlanSchema.properties as Record<string, unknown>).tracked = { type: 'array', minItems: 3, maxItems: 10, items: object({ id: string, name: string, start: string }) };
(thesisPlanSchema.required as string[]).push('tracked');
