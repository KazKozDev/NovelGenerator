export type AuditStatus = 'COMPLETE' | 'COMPLETE_WITH_WARNINGS' | 'PARTIAL' | 'FAILED';

export interface FinalReport {
  coverage: { material_examined: string; limitations: string[] };
  findings: {
    category: string;
    severity: string;
    description: string;
    evidence_refs: string[];
    reader_impact: string;
    certainty: string;
  }[];
  central_resolution: { supported: boolean; evidence_refs: string[]; comment: string };
  unresolved_major_promises: string[];
  need_more_evidence: string[];
  summary: string;
  status: AuditStatus;
}

export interface ProjectInput {
  planning_version?: 2;
  generation_mode?: 'author';
  premise: string;
  chapter_count: number;
  genre: string;
  target_total_words: number;
  author_requirements: string;
}
