import { measureTexture, signatureTics, wornPhrases, type TicReport } from '../analytics';
import { matchKey } from './normalize';
import { bandsFor, readRung } from './profile';
import type { ProjectStore } from './store';
import type { BookProfile, ReaderThread } from './types';

/**
 * The craft ledger: what the book has spent of itself.
 *
 * StoryState is the ledger of the world — what happened, who knows it, where
 * everyone stands. This is the ledger of the form: which mechanisms are spent,
 * which rungs are taken, which classes of change the scenes keep producing,
 * which phrasing is worn through, how the texture is drifting from what the
 * book declared. Same pattern as the state store and the same discipline —
 * written by code at scene acceptance, never by a model, never from a plan.
 *
 * Nothing here is judged. It is counted, and read back by the planner before
 * the next chapter exists and by the writer's package before the next scene
 * does. Prevention where the pipeline can afford it, detection only where it
 * cannot.
 */

/** Mechanisms spent by finished chapters, with the chapters that spent them. */
export function spentMechanisms(store: ProjectStore, throughChapter: number): { mechanism: string; chapters: number[] }[] {
  const spent = new Map<string, { mechanism: string; chapters: number[] }>();
  for (let chapter = 1; chapter <= throughChapter; chapter++) {
    const plan = store.loadChapterPlan(chapter);
    const mechanism = (plan?.mechanism || '').trim();
    if (!mechanism) continue;
    const key = matchKey(mechanism);
    const entry = spent.get(key) || { mechanism, chapters: [] };
    if (!entry.chapters.includes(chapter)) entry.chapters.push(chapter);
    spent.set(key, entry);
  }
  return [...spent.values()];
}

/** Rungs taken by finished chapters, oldest first — the measured shape of the curve so far. */
export function priorRungs(store: ProjectStore, throughChapter: number): number[] {
  const rungs: number[] = [];
  for (let chapter = 1; chapter <= throughChapter; chapter++) {
    const rung = readRung(store.loadChapterPlan(chapter)?.pressure_rung);
    if (rung !== null) rungs.push(rung);
  }
  return rungs;
}

/**
 * Outcome classes of the accepted scenes, oldest first. Read off the stored
 * scene records rather than the plans, so a scene that was rebased carries the
 * class it was actually written to.
 */
export function priorOutcomeKinds(store: ProjectStore, throughChapter: number, limit = 12): string[] {
  const kinds: string[] = [];
  for (let chapter = 1; chapter <= throughChapter; chapter++) {
    for (const record of store.chapterScenes(chapter)) {
      const kind = (record.plan?.outcome_kind || '').trim();
      if (kind) kinds.push(kind);
    }
  }
  return kinds.slice(-limit);
}

/** Every word of prose the book has accepted so far, newest chapters last. */
export function acceptedProse(store: ProjectStore, throughChapter?: number): { ref: string; text: string }[] {
  return store.manuscript()
    .filter(item => item.text.trim() && (throughChapter === undefined || item.chapter <= throughChapter))
    .sort((first, second) => first.chapter - second.chapter)
    .map(item => ({ ref: `Chapter ${item.chapter}`, text: item.text }));
}

export interface WornEntry {
  phrase: string;
  uses: number;
}

/**
 * The phrase ledger: what the book has worn out, minus what it declared it
 * would repeat.
 *
 * Two changes from the advisory tired-phrase list this replaces, and both
 * matter. It reads the whole accepted manuscript rather than a window, because
 * a tic that started in chapter two is exactly the one the writer cannot see by
 * chapter seven. And it subtracts the profile's declared motifs, because a
 * refrain is a repetition the book means — banning it would destroy the thing
 * that makes such a book work.
 *
 * What comes back is enumerable on purpose. A model told "vary your language"
 * varies nothing; a model handed fourteen exact strings it may not write does
 * not write them.
 */
export function wornLedger(store: ProjectStore, profile: BookProfile, throughChapter?: number, maxPhrases = 14): WornEntry[] {
  const prose = acceptedProse(store, throughChapter).map(item => item.text).join('\n\n');
  if (!prose.trim()) return [];
  const tolerance = bandsFor(profile).phraseTolerance;
  const exempt = profile.declared_motifs.map(motif => ({ key: matchKey(motif.motif), allowed: motif.allowed_uses }));
  return wornPhrases(prose, tolerance, 0.35, maxPhrases * 2)
    .filter(item => {
      // A declared refrain is exempt up to its own budget and counted past it:
      // the declaration buys permission, not immunity.
      const motif = exempt.find(entry => entry.key.includes(matchKey(item.phrase)) || matchKey(item.phrase).includes(entry.key));
      return !motif || item.uses > motif.allowed;
    })
    .slice(0, maxPhrases)
    .map(item => ({ phrase: item.phrase, uses: item.uses }));
}

/**
 * The ban list as the writer's package carries it: exact strings, not advice.
 *
 * What is banned is the phrasing, never the thing. The detector counts word
 * runs and cannot tell a tic from an object the story owns — "left hand" and
 * a two-word somatic tic look identical to it — and forbidding the object
 * buys a worse sentence than the repetition did. So the instruction is exact
 * about the words and explicit about the escape: name the thing plainly.
 */
export function describeWorn(worn: WornEntry[]): string {
  if (!worn.length) return '(nothing worn out yet)';
  return worn.map(item => `- "${item.phrase}" — written ${item.uses} times already. Do not repeat this wording or build another image on it. If the thing itself must appear again, name it plainly and move on.`).join('\n');
}

export interface DriftReport {
  /** Measured share of words the book gives to speech, across the accepted text. */
  dialogueShare: number;
  /** The same share per chapter, oldest first. */
  byChapter: { chapter: number; dialogueShare: number }[];
  /** Present when the book is drifting away from its own opening, whatever the band says. */
  trend: string | null;
  /** The band this book's declared dialogue weight resolves to. */
  band: [number, number];
  /** Present when the measurement is outside the band. */
  drift: string | null;
  tics: TicReport[];
}

/**
 * Declared against measured, chapter by chapter.
 *
 * The profile is not only a source of thresholds — it is a target, and the gap
 * between what the book said it was and what it is turning out to be is itself
 * a signal, free of model calls and visible at chapter two rather than at the
 * final audit. A book that declared itself dialogue-forward and is writing four
 * percent dialogue has not been written badly; it has failed to execute its own
 * intent, which is a different problem with a different fix.
 */
export function textureDrift(store: ProjectStore, profile: BookProfile, throughChapter?: number): DriftReport {
  const chapters = acceptedProse(store, throughChapter);
  const prose = chapters.map(item => item.text).join('\n\n');
  const band = bandsFor(profile).dialogueShare;
  const measured = measureTexture(prose);
  const tics = signatureTics(prose);
  // Below a chapter's worth of prose the measurement is noise, and reporting
  // noise as drift teaches the reader to stop reading the warnings.
  const enough = prose.split(/\s+/).filter(Boolean).length >= 1500;
  const declared = `The book declared dialogue weight "${profile.dialogue_weight}" and is running at ${(measured.dialogueShare * 100).toFixed(1)}% spoken words`;
  const implied = `the ${(band[0] * 100).toFixed(0)}–${(band[1] * 100).toFixed(0)}% that implies`;
  let drift: string | null = null;
  if (enough && measured.dialogueShare < band[0]) {
    drift = `${declared}, below ${implied}. The scenes are being narrated where they were meant to be spoken.`;
  } else if (enough && measured.dialogueShare > band[1]) {
    drift = `${declared}, above ${implied}.`;
  }
  // The band above is a judgement call; this is not. A book that gives less to
  // speech in every chapter than in the one before is moving away from whatever
  // it started as, and saying so needs no threshold anybody had to invent — only
  // the book's own numbers. It is the signal that actually caught a run falling
  // 7.4% to 5.2% to 3.8% while the band said the same thing three times.
  const byChapter = chapters.map(item => ({
    chapter: Number(item.ref.replace(/\D+/g, '')) || 0,
    dialogueShare: measureTexture(item.text).dialogueShare,
  }));
  let trend: string | null = null;
  if (byChapter.length >= 3) {
    const shares = byChapter.map(item => item.dialogueShare);
    const falling = shares.every((value, index) => index === 0 || value < shares[index - 1]);
    if (falling && shares.at(-1)! < shares[0] * 0.75) {
      trend = `Dialogue has fallen in every chapter so far: ${shares.map(value => `${(value * 100).toFixed(1)}%`).join(' → ')}. Whatever the right level is for this book, it is moving away from the one it opened with.`;
    }
  }
  return { dialogueShare: measured.dialogueShare, byChapter, band, drift, trend, tics };
}

/**
 * Promises still standing, each with the chapter that made it.
 *
 * The chapter comes from the scene that opened the thread — ids are minted as
 * `CH02_S01-t3` — because how long a promise has been waiting is the only thing
 * that separates one the book is still working on from one it has dropped.
 */
export function openThreadsWithAge(store: ProjectStore): { thread: ReaderThread; madeInChapter: number }[] {
  return store.loadThreads()
    .filter(thread => thread.status === 'open')
    .map(thread => {
      const source = thread.setup_refs[0] || thread.id;
      const chapter = Number(/CH(\d+)/i.exec(source)?.[1]);
      return { thread, madeInChapter: Number.isFinite(chapter) ? chapter : 0 };
    })
    .filter(item => item.madeInChapter > 0);
}

export interface ThinScene {
  scene: string;
  words: number;
  events: number;
  /** Events per thousand words. */
  rate: number;
  /** The same rate across every scene the book has accepted so far. */
  bookRate: number;
}

/**
 * Scenes where far less happens than in the rest of this book.
 *
 * Presence is not the measure. A closing scene of pure interiority still
 * records events — a hand lifted, a clasp touched, a choice restated — and a
 * check for an empty delta passes it. Density is the measure: the same scene
 * carries four events across nine hundred words where the book has been
 * carrying ten per thousand, and a reader feels that as a chapter that stopped
 * rather than ended.
 *
 * The bar is the book's own rate, not a number anyone chose. A meditative book
 * establishes a low rate and is judged against it; a brisk one the same. Only a
 * scene falling well below what this book has already proved it does gets
 * named, and only once the book has enough accepted scenes to have a rate at
 * all.
 */
export function thinScenes(store: ProjectStore, throughChapter: number, floor = 0.6, minScenes = 4): ThinScene[] {
  const scenes: { scene: string; words: number; events: number }[] = [];
  for (let chapter = 1; chapter <= throughChapter; chapter++) {
    for (const record of store.chapterScenes(chapter)) {
      if (!record.delta || !record.prose.trim()) continue;
      scenes.push({
        scene: record.id,
        words: record.prose.split(/\s+/).filter(Boolean).length,
        events: (record.delta.events || []).length,
      });
    }
  }
  if (scenes.length < minScenes) return [];
  const totalWords = scenes.reduce((sum, item) => sum + item.words, 0);
  const totalEvents = scenes.reduce((sum, item) => sum + item.events, 0);
  if (!totalWords || !totalEvents) return [];
  const bookRate = (totalEvents / totalWords) * 1000;
  return scenes
    .map(item => ({ ...item, rate: item.words ? (item.events / item.words) * 1000 : 0, bookRate }))
    .filter(item => item.words >= 300 && item.rate < bookRate * floor)
    .sort((first, second) => first.rate - second.rate);
}
