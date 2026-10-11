/** Review-local paragraph addresses. Never fuzzy-match or manufacture quotations. */
export function proseEvidence(prose: string) {
  const paragraphs = prose.split(/\n\s*\n/).filter(p => p.trim());
  const references = new Map(paragraphs.map((paragraph, index) => [`@P${String(index + 1).padStart(4, '0')}`, paragraph]));
  return { references, annotated: [...references].map(([id, paragraph]) => `${id}\n${paragraph}`).join('\n\n') };
}
export function resolveProseEvidence(evidence: string | undefined, prose: string): string | undefined {
  if (!evidence || !/^@P\d{4,}$/.test(evidence.trim())) return evidence;
  return proseEvidence(prose).references.get(evidence.trim());
}
export const EVIDENCE_INSTRUCTIONS = '\nEVIDENCE REFERENCES: Supplied prose paragraphs have review-local addresses @P0001, @P0002, etc. In each issue.evidence, return ONE existing paragraph address, not a paraphrase or reconstructed quote. Code will attach the exact paragraph from the supplied prose. For an omitted event cite the paragraph where the missing causal step matters and explain the omission in consequence. References are valid only for this review; never reuse an address from an earlier review. Direct exact quotes remain accepted for compatibility.';
