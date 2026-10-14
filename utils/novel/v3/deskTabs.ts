/**
 * What the author's tools hold, as text a person can read: one tab per tool.
 * Craft Architecture 2.0 tabs: Dossier, Scene Cards, Observer, Reader, Reviews.
 */
import type { DeskState } from './authorDesk';

export type DeskTab = { name: string; count: number; text: string };

const quote = (text: string) => text.trim().split('\n').map(line => `> ${line}`).join('\n');

export function deskTabs(desk: DeskState): DeskTab[] {
  const readers = desk.answers.filter(answer => /reader|listener/i.test(answer.who));
  const observers = desk.answers.filter(answer => /observer/i.test(answer.who));
  const reviews = desk.answers.filter(answer => /review/i.test(answer.who));
  const none = (what: string) => `*${what}*`;

  const tabs: DeskTab[] = [];

  // 1. Dossier (4 Layers of Truth)
  tabs.push({
    name: 'Dossier',
    count: desk.files['dossier.md']?.trim() ? 1 : 0,
    text: desk.files['dossier.md']?.trim()
      ? `## Author Dossier & 4 Layers of Truth\n\n${desk.files['dossier.md'].trim()}`
      : none('Author dossier has not been generated yet.')
  });

  // 2. Scene Cards (Projection Matrix)
  const sceneCardsContent = desk.files['plan.md']?.trim() || desk.files['notebook.md']?.trim();
  tabs.push({
    name: 'Scene Cards',
    count: sceneCardsContent ? 1 : 0,
    text: sceneCardsContent
      ? `## Scene Cards & Projection Matrix\n\n${sceneCardsContent}`
      : none('Scene cards have not been projected yet.')
  });

  // 3. Observer (Scene Enactment Validation)
  tabs.push({
    name: 'Observer',
    count: observers.length,
    text: observers.length > 0
      ? observers.map(answer => `${answer.text.trim()}`).join('\n\n---\n\n')
      : none('No observer validation receipts yet.')
  });

  // 4. Blind Reader (Prefix Hypotheses & Reader Expectations)
  tabs.push({
    name: 'Reader',
    count: readers.length,
    text: readers.length > 0
      ? readers.map(answer => `### Step ${answer.step} · ${answer.who}${answer.about ? `, through ${answer.about}` : ''}\n\n${answer.asked?.trim() ? `**The author asked**\n\n${quote(answer.asked)}\n\n` : ''}**${answer.who.startsWith('a listener') ? 'The listener' : 'The reader'}**\n\n${answer.text.trim()}${answer.stale ? `\n\n*The author has changed ${answer.about} since this was said.*` : ''}`).join('\n\n---\n\n')
      : none('The blind reader has not reviewed any chapters yet.')
  });

  // 5. Reviews (Dual Audit: Developmental & Literary)
  tabs.push({
    name: 'Reviews',
    count: reviews.length,
    text: reviews.length > 0
      ? reviews.map(answer => `### ${answer.who}\n\n${answer.text.trim()}`).join('\n\n---\n\n')
      : none('No dual audits filed yet.')
  });

  return tabs;
}

export type DeskFocus = { /** The tab the author is working in now; null when it is writing a chapter. */ tab: string | null; label: string; text: string };

/**
 * Where the author is working at this moment, read from the answer as it arrives, so that the screen can
 * follow it: into Dossier, Scene Cards, Observer, Reader, or Reviews — and back to the chapter when it writes prose.
 */
export function deskFocus(stage: string, arrived: string, _last: string | null): DeskFocus | undefined {
  if (stage === 'craft-preparation') return { tab: 'Dossier', label: 'Drafting 4-layer author dossier', text: arrived };
  if (stage === 'craft-cards') return { tab: 'Scene Cards', label: 'Projecting scene cards & knowledge', text: arrived };
  if (stage === 'craft-observe') return { tab: 'Observer', label: 'Observer validating scene enactment', text: arrived };
  if (stage === 'craft-reader' || stage === 'author-reader') return { tab: 'Reader', label: 'Blind reader reviewing chapter prefix', text: arrived };
  if (stage === 'craft-dev-review' || stage === 'craft-lit-review') return { tab: 'Reviews', label: 'Craft audit in progress', text: arrived };
  if (stage === 'craft-write' || stage === 'craft-repair' || stage === 'author-step' || stage === 'author-chapter') return { tab: null, label: '', text: '' };
  return undefined;
}
