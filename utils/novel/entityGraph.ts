import { ManuscriptBlock } from './hybridSearch';

export interface EntityOccurrence {
  chapterNum: number;
  blockId: string;
  snippet: string;
}

export interface EntityReference {
  entity: string;
  category: 'character' | 'prop' | 'injury' | 'timer' | 'location' | 'rule';
  occurrences: EntityOccurrence[];
}

export interface EntityGraph {
  entities: Map<string, EntityReference>;
  chapterEntityIndex: Map<number, Set<string>>;
}

export interface CrossTextImpactWarning {
  entity: string;
  modifiedChapter: number;
  impactedChapters: number[];
  warning: string;
}

const COMMON_PROP_PATTERNS = [
  /\b(?:oxygen(?:\s+canister|\s+tank|\s+cylinder)?|canister|cylinder)\b/gi,
  /\b(?:cowl|mask|cape|boots?|gloves?|goggles?|glasses?|scanner|stylus|lantern|wire|key|logbook|flashlight)\b/gi,
];

const COMMON_INJURY_PATTERNS = [
  /\b(?:fracture|scaphoid|tremor|concussion|wound|bleeding|bruise|burn)\b/gi,
];

const TIMER_PATTERNS = [
  /\b(?:\d{1,2}:\d{2}(?::\d{2})?|\d+\s*(?:minutes?|hours?|seconds?))\b/gi,
];

const COMMON_RULE_PATTERNS = [
  /\b(?:override(?:\s+code)?|passcode|code|cipher|protocol|encryption|failsafe|access\s+code|clearance)\b/gi,
  /\b(?:rotating|rotates|rotation|static(?:\s+code)?|birthday\s+code|memorized\s+code|biometric|frequency)\b/gi,
  /\b(?:код(?:\s+доступа)?|пароль|шифр|протокол|статический|ротируемый|ротация|биометри\w*|частота)\b/gi,
];

const COMMON_LOCATION_PATTERNS = [
  /\b(?:batcave|subbasement|sub-basement|vault|elevator|corridor|manor|laboratory|rooftop|tunnel|hangar|chamber|bunker)\b/gi,
  /\b(?:бэтпещера|подвал|цокол\w*|бункер|хранилищ\w*|лифт|коридор|особняк|лаборатори\w*|крыш\w*|туннел\w*|ангар)\b/gi,
];

export function buildEntityGraph(blocks: ManuscriptBlock[], dossier?: any): EntityGraph {
  const entities = new Map<string, EntityReference>();
  const chapterEntityIndex = new Map<number, Set<string>>();

  function addEntity(name: string, category: EntityReference['category'], block: ManuscriptBlock) {
    const clean = name.trim().toLowerCase();
    if (clean.length < 3) return;

    if (!entities.has(clean)) {
      entities.set(clean, {
        entity: clean,
        category,
        occurrences: [],
      });
    }

    const ref = entities.get(clean)!;
    if (!ref.occurrences.some(o => o.blockId === block.id)) {
      const idx = block.text.toLowerCase().indexOf(clean);
      const start = Math.max(0, idx - 30);
      const end = Math.min(block.text.length, idx + clean.length + 30);
      const snippet = block.text.slice(start, end).trim();

      ref.occurrences.push({
        chapterNum: block.chapterNum,
        blockId: block.id,
        snippet,
      });
    }

    if (!chapterEntityIndex.has(block.chapterNum)) {
      chapterEntityIndex.set(block.chapterNum, new Set());
    }
    chapterEntityIndex.get(block.chapterNum)!.add(clean);
  }

  // Scan dossier characters if available
  if (dossier?.characters && Array.isArray(dossier.characters)) {
    for (const c of dossier.characters) {
      if (typeof c?.name === 'string' && c.name.trim()) {
        const charName = c.name.trim();
        for (const b of blocks) {
          if (new RegExp(`\\b${charName}\\b`, 'i').test(b.text)) {
            addEntity(charName, 'character', b);
          }
        }
      }
    }
  }

  // Scan blocks for props, injuries, timers
  for (const b of blocks) {
    for (const regex of COMMON_PROP_PATTERNS) {
      const matches = b.text.match(regex);
      if (matches) {
        for (const m of matches) addEntity(m, 'prop', b);
      }
    }
    for (const regex of COMMON_INJURY_PATTERNS) {
      const matches = b.text.match(regex);
      if (matches) {
        for (const m of matches) addEntity(m, 'injury', b);
      }
    }
    for (const regex of TIMER_PATTERNS) {
      const matches = b.text.match(regex);
      if (matches) {
        for (const m of matches) addEntity(m, 'timer', b);
      }
    }
    for (const regex of COMMON_RULE_PATTERNS) {
      const matches = b.text.match(regex);
      if (matches) {
        for (const m of matches) addEntity(m, 'rule', b);
      }
    }
    for (const regex of COMMON_LOCATION_PATTERNS) {
      const matches = b.text.match(regex);
      if (matches) {
        for (const m of matches) addEntity(m, 'location', b);
      }
    }
  }

  return { entities, chapterEntityIndex };
}

export function checkCrossTextImpact(
  graph: EntityGraph,
  targetTerm: string,
  fromChapter: number
): CrossTextImpactWarning[] {
  if (!targetTerm || !targetTerm.trim()) return [];
  const cleanTerm = targetTerm.trim().toLowerCase();
  const warnings: CrossTextImpactWarning[] = [];

  for (const [entityKey, ref] of graph.entities.entries()) {
    if (cleanTerm.includes(entityKey) || entityKey.includes(cleanTerm)) {
      const otherChapters = Array.from(
        new Set(ref.occurrences.map(o => o.chapterNum).filter(ch => ch !== fromChapter))
      ).sort((a, b) => a - b);

      if (otherChapters.length > 0) {
        warnings.push({
          entity: entityKey,
          modifiedChapter: fromChapter,
          impactedChapters: otherChapters,
          warning: `Entity "${entityKey}" (${ref.category}) also appears in Chapter ${otherChapters.join(', ')}. Changing it in Chapter ${fromChapter} may cause cross-chapter continuity issues.`,
        });
      }
    }
  }

  return warnings;
}
