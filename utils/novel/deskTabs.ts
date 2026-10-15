/**
 * What the author's tools hold, as text a person can read: one tab per tool.
 * Craft Architecture 2.0 tabs: Dossier, Scene Cards, Observer, Reader, Reviews.
 */
import type { DeskState } from './author';

export type DeskTab = { name: string; count: number; text: string };

const quote = (text: string) => text.trim().split('\n').map(line => `> ${line}`).join('\n');

export function deskTabs(desk: DeskState): DeskTab[] {
  const readers = desk.answers.filter(answer => /reader|listener/i.test(answer.who));
  const observers = desk.answers.filter(answer => /observer/i.test(answer.who));
  const reviews = desk.answers.filter(answer => /review/i.test(answer.who));
  const none = (what: string) => `*${what}*`;

  const tabs: DeskTab[] = [];

  if (desk.files['engine-state.json']) {
    let text = '*Author decisions are being developed.*', count = 0;
    try {
      const state = JSON.parse(desk.files['engine-state.json']);
      const rows = Object.entries(state.operations || {}).map(([name, raw]) => {
        const op = raw as { status: string; output: string; error?: string };
        return `| ${name} | ${op.status} | ${op.output} |`;
      });
      count = rows.length;
      const decisions = ['concept.json', 'opposition-plan.json', 'promises.json', 'setups-payoffs.json', 'revelation-plan.json', 'pacing-plan.json', 'scene-graph.json', 'revision-plan.json']
        .filter(file => desk.files[file]).map(file => `### ${file}\n\n\`\`\`json\n${desk.files[file]}\n\`\`\``).join('\n\n');
      text = `## Author decisions\n\nCurrent work: ${state.phase}\n\n| Operation | State | Artifact |\n| --- | --- | --- |\n${rows.join('\n')}\n\n${decisions}`;
    } catch { text = '*Saved author decisions could not be displayed; original artifacts retained.*'; }
    tabs.push({ name: 'Author decisions', count, text });
  }

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
      ? reviews.map(answer => `### Step ${answer.step} · ${answer.who}\n\n${answer.text.trim()}`).join('\n\n---\n\n')
      : none('Dual developmental & literary audits have not run yet.')
  });

  return tabs;
}

export interface DeskFocus {
  tab: string | null;
  label: string;
  text: string;
}

/**
 * Maps the active pipeline stage to the appropriate inspector tab and live activity text.
 */
export function deskFocus(stage: string, arrived: string, activeTab: string | null): DeskFocus | null {
  if (stage.startsWith('craft-author-')) return { tab: 'Author decisions', label: `Developing ${stage.replace('craft-author-', '').replaceAll('-', ' ')}`, text: arrived };
  if (stage === 'craft-preparation') {
    return { tab: 'Dossier', label: 'Drafting 4-layer author dossier', text: arrived };
  }
  if (stage === 'craft-cards') {
    return { tab: 'Scene Cards', label: 'Projecting scene cards & knowledge', text: arrived };
  }
  if (stage === 'craft-observe') {
    return { tab: 'Observer', label: 'Observer validating scene enactment', text: arrived };
  }
  if (stage === 'craft-reader') {
    return { tab: 'Reader', label: 'Blind reader reviewing chapter prefix', text: arrived };
  }
  if (stage === 'craft-dev-review' || stage === 'craft-lit-review') {
    return { tab: 'Reviews', label: 'Craft audit in progress', text: arrived };
  }
  if (stage === 'craft-write' || stage === 'craft-repair') {
    return { tab: activeTab, label: '', text: '' };
  }
  return null;
}
