/**
 * Who speaks a line, and who a pronoun means — read by BookNLP and F-Coref rather than judged by the
 * writer's own model.
 *
 * This is the ground a knowledge record needs and the engine does not have. "Maria gave him the
 * address" only becomes a record of what Alexei knows once something says that Maria spoke and that
 * "him" is Alexei; today a large model decides both from scratch every round, and across every stored
 * run "a character uses knowledge the story has not given them" is the second most frequent finding
 * of all — 213 of 930.
 *
 * Observational for now: the map is written beside the run and read by nothing. It has to be measured
 * against chapters we have judged by hand before it is allowed to affect a verdict, and its first
 * trial already folded one character into another while attributing every line of dialogue correctly.
 *
 * Node only, and English only. The models run through a pinned virtualenv (.venv-booknlp), so a
 * browser cannot call this, and a chapter in another script comes back as unavailable rather than as
 * a chapter with no dialogue in it.
 */
export interface SpeechMap {
  characters: { id: number; names: string[]; mentions: number }[];
  quotes: { speaker: number | null; attributedTo: string; startToken: number; text: string }[];
  coreference: string[][];
}

export const speechMapInterpreter = '.venv-booknlp/bin/python';
export const speechMapScript = 'scripts/speech-map.py';

/** True when the prose is in a script these English-only models can read at all. */
export function speechMapApplies(content: string): boolean {
  const letters = content.match(/[^\W\d_]/gu) || [];
  if (!letters.length) return false;
  return letters.filter(letter => /[a-z]/i.test(letter)).length / letters.length > 0.8;
}

/**
 * Runs the two models over one chapter. Returns undefined rather than throwing when the environment
 * is not there or the prose is not English: a missing map must never read as a map with nothing in it.
 */
export async function readSpeechMap(content: string, root = process.cwd()): Promise<SpeechMap | undefined> {
  if (!speechMapApplies(content)) return undefined;
  const [{ execFile }, { mkdtemp, writeFile, readFile, rm }, { tmpdir }, path] = await Promise.all([
    import('node:child_process'), import('node:fs/promises'), import('node:os'), import('node:path'),
  ]);
  const work = await mkdtemp(path.join(tmpdir(), 'speech-map-'));
  try {
    const source = path.join(work, 'chapter.txt');
    const target = path.join(work, 'map.json');
    await writeFile(source, content, 'utf8');
    await new Promise<void>((resolve, reject) => {
      execFile(path.join(root, speechMapInterpreter), [path.join(root, speechMapScript), source, target],
        { cwd: root, maxBuffer: 1 << 24 }, error => error ? reject(error) : resolve());
    });
    const parsed = JSON.parse(await readFile(target, 'utf8'));
    return parsed.error ? undefined : parsed as SpeechMap;
  } catch {
    return undefined;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * What the map says a character was told, in the order the chapter says it. A line addressed in a
 * scene is not proof that anyone understood it, so these are candidates for a knowledge record to be
 * built from and checked — never entries in one.
 */
export function spokenBy(map: SpeechMap, character: number): { text: string; startToken: number }[] {
  return map.quotes.filter(quote => quote.speaker === character)
    .map(({ text, startToken }) => ({ text, startToken }))
    .sort((first, second) => first.startToken - second.startToken);
}
