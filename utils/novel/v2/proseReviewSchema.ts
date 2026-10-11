/** Plan reviews have no prose quotations, but require actionable, correctly addressed findings. */
export function planReviewSchema(ids: string[]) {
  return {
    type:'object',required:['ready','issues'],additionalProperties:false,
    properties:{ready:{type:'boolean'},issues:{type:'array',items:{
      type:'object',required:['severity','thesis_ids','problem','required_change'],additionalProperties:false,
      properties:{
        severity:{type:'string',enum:['major','minor']},
        thesis_ids:{type:'array',minItems:1,uniqueItems:true,items:{type:'string',enum:ids}},
        problem:{type:'string',minLength:1},required_change:{type:'string',minLength:1},
      },
    }}},
  };
}

export const proseReviewSchema = {
  type: 'object', required: ['ready', 'issues'], additionalProperties: false,
  properties: {
    ready: { type: 'boolean' },
    issues: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['severity', 'kind', 'evidence', 'consequence', 'thesis_ids', 'problem', 'required_change'],
      properties: {
        severity: { type: 'string', enum: ['major', 'minor'] },
        kind: { type: 'string', enum: ['contradiction', 'impossible_action', 'unsupported_knowledge', 'missing_event', 'continuity', 'premature_disclosure', 'author_requirement', 'narrative_failure', 'style'] },
        evidence: { type: 'string', description: 'One supplied review-local paragraph address such as @P0001. Code resolves the exact quote.' }, consequence: { type: 'string' },
        thesis_ids: { type: 'array', minItems: 1, items: { type: 'string' } },
        problem: { type: 'string', minLength: 1 }, required_change: { type: 'string', minLength: 1 },
      },
    } },
  },
};

export const repairVerificationSchema = (count: number, evidenceRefs?:string[]) => ({
  type: 'object', required: ['ready', 'checks', 'issues'], additionalProperties: false,
  properties: {
    ...proseReviewSchema.properties,
    ...(evidenceRefs?{issues:{...proseReviewSchema.properties.issues,items:{...proseReviewSchema.properties.issues.items,properties:{...proseReviewSchema.properties.issues.items.properties,evidence:{type:"string",enum:evidenceRefs}}}}}:{}),
    checks: {type:'array',minItems:count,maxItems:count,items:{
      type:'object',required:['issue','status','evidence','explanation'],additionalProperties:false,
      properties:{issue:{type:'integer',minimum:0,maximum:count-1},status:{type:'string',enum:['repaired','not_a_defect','unresolved']},evidence:{type:'string',description:'ONE review-local source address; never a reconstructed quotation',...(evidenceRefs?{enum:evidenceRefs}:{})},explanation:{type:'string',minLength:1}},
    }},
  },
});
