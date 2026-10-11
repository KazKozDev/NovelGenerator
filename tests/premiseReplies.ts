/** Clean answers for the two premise checks a planning_version 2 outline receives. */
export const premiseReply = (options: any): string | undefined =>
  options?.stage === 'thesis-plan-stress' || options?.stage === 'thesis-plan-dryrun' ? JSON.stringify({ ready: true, issues: [] })
  : options?.stage === 'thesis-premise-coverage' ? JSON.stringify({ coverage: Array.from({ length: options.schema.properties.coverage.minItems }, (_, given) => ({
      given, kind: 'story', thesis_id: options.schema.properties.coverage.items.properties.thesis_id.enum[0], field: 'action', note: 'Played as the scene action' })) })
  : options?.stage === 'thesis-habits' ? JSON.stringify({ habits: [] })
  : undefined;
