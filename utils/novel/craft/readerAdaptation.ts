import type { AuthorArchitecture, ReaderDecision } from './types';
export interface PresentationAdjustment { source: string; scene: string; action: string; intendedEffect: string }
export function validateReaderDecision(plan: AuthorArchitecture, currentOrder: number, decision: ReaderDecision): void {
  if (decision.adjustments.some(a => !plan.graph.scenes.some(s => s.id === a.scene && s.order >= currentOrder))) throw new Error('Reader adaptation cannot alter committed scenes or invent scene IDs.');
}
export function pendingPresentation(plan: AuthorArchitecture, scene: string, previous: PresentationAdjustment[]): PresentationAdjustment[] {
  const order = plan.graph.scenes.find(s => s.id === scene)!.order;
  return previous.filter(a => a.scene === scene && plan.graph.scenes.some(s => s.id === a.source && s.order < order));
}
