/**
 * Search by meaning with sentence embeddings.
 */
export const SIMILAR_MODEL = 'sentence-transformers/multi-qa-MiniLM-L6-cos-v1';
export interface SimilarRequest { source: string; sentences: string[] }
