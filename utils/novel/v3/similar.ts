/**
 * Search by meaning. A small network that turns a line into numbers, so that two lines that say the same thing in
 * different words come out close: a line and another line that says the same thing without repeating its words.
 * It does not write, choose or judge: lines in, a number for each out, and code decides what is shown.
 */
export const SIMILAR_MODEL = 'sentence-transformers/multi-qa-MiniLM-L6-cos-v1';
/** What the host is asked: one text, and the lines to measure against it. It answers with a number for each line. */
export interface SimilarRequest { source: string; sentences: string[] }
