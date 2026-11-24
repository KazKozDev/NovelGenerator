import { describe, expect, it } from 'vitest';
import { deskTabs, deskFocus } from '../utils/novel/deskTabs';
import type { DeskState } from '../utils/novel/author';

function createMockDesk(overrides?: Partial<DeskState>): DeskState {
  return {
    step: 1,
    budget: 50,
    files: {},
    journal: [],
    answers: [],
    spent: 0,
    finished: false,
    ...overrides,
  };
}

describe('deskTabs for Craft 2.0', () => {
  it('returns default tabs when desk state is empty', () => {
    const desk = createMockDesk();
    const tabs = deskTabs(desk);
    expect(tabs.map(t => t.name)).toEqual(['Dossier', 'Scene Cards', 'Observer', 'Reader', 'Reviews']);
    expect(tabs[0].count).toBe(0);
    expect(tabs[0].text).toContain('Author dossier has not been generated yet');
  });

  it('populates Dossier tab when dossier.md is present', () => {
    const desk = createMockDesk({
      files: { 'dossier.md': '# Character Dossier\nProtagonist secrets.' },
    });
    const tabs = deskTabs(desk);
    const dossierTab = tabs.find(t => t.name === 'Dossier')!;
    expect(dossierTab.count).toBe(1);
    expect(dossierTab.text).toContain('Protagonist secrets.');
  });

  it('populates Scene Cards tab when plan.md is present', () => {
    const desk = createMockDesk({
      files: { 'plan.md': '## Chapter 1: The Breach' },
    });
    const tabs = deskTabs(desk);
    const cardsTab = tabs.find(t => t.name === 'Scene Cards')!;
    expect(cardsTab.count).toBe(1);
    expect(cardsTab.text).toContain('## Chapter 1: The Breach');
  });

  it('populates Observer and Reader tabs from desk answers', () => {
    const desk = createMockDesk({
      answers: [
        { step: 1, who: 'Observer Check', about: 'Chapter 1', asked: '', text: 'Sensory grounding verified.' },
        { step: 2, who: 'Blind Reader', about: 'Chapter 1', asked: 'What did you expect?', text: 'Anticipating betrayal.' },
      ],
    });
    const tabs = deskTabs(desk);
    const observerTab = tabs.find(t => t.name === 'Observer')!;
    const readerTab = tabs.find(t => t.name === 'Reader')!;
    expect(observerTab.count).toBe(1);
    expect(observerTab.text).toContain('Sensory grounding verified.');
    expect(readerTab.count).toBe(1);
    expect(readerTab.text).toContain('Anticipating betrayal.');
  });

  it('calculates deskFocus based on stage and arrived text', () => {
    const focus1 = deskFocus('craft-preparation', 'dossier generated', null);
    expect(focus1?.tab).toBe('Dossier');
    expect(focus1?.label).toContain('4-layer author dossier');

    const focus2 = deskFocus('craft-cards', 'scene cards projected', null);
    expect(focus2?.tab).toBe('Scene Cards');

    const focus3 = deskFocus('craft-observe', 'scene enactment check', null);
    expect(focus3?.tab).toBe('Observer');

    const focus4 = deskFocus('craft-reader', 'blind reader hypothesis', null);
    expect(focus4?.tab).toBe('Reader');

    const focus5 = deskFocus('craft-dev-review', 'developmental review pass', null);
    expect(focus5?.tab).toBe('Reviews');

    const focus6 = deskFocus('unknown-stage', 'some log', null);
    expect(focus6).toBeNull();
  });
});
