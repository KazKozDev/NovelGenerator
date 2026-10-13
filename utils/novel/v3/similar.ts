/**
 * Search by meaning. A small network that turns a line into numbers, so that two lines that say the same thing in
 * different words come out close: "the clock ran four minutes slow" beside "a clock that ran a few minutes fast",
 * "I was here all afternoon" beside the envelope's "2:55 p.m. — she leaves by the back stairs and goes home".
 * It does not write, choose or judge: lines in, a number for each out, and code decides what is shown.
 */
export const SIMILAR_MODEL = 'sentence-transformers/multi-qa-MiniLM-L6-cos-v1';
/** What the host is asked: one text, and the lines to measure against it. It answers with a number for each line. */
export interface SimilarRequest { source: string; sentences: string[] }
