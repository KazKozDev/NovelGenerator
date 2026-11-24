import type { Packet } from './craftOrchestrator';
import type { Chapter } from './editorial';

export function bookLayout(chapters: number, target: number) {
  const chapterCount = Math.max(1, Math.floor(chapters));
  const words = Math.max(300 * chapterCount, Math.round(target || chapterCount * 2500));
  const scenes = chapterCount * 3;
  return { chapters: chapterCount, scenes, wordsPerScene: Math.round(words / scenes), totalWords: words };
}

export function projectionMetrics(packet: Packet) {
  const loops = new Set<string>();
  const props = new Map<string, { scene: number; role: string }[]>();
  const scenes = packet.scenes.map(scene => {
    for (const loop of scene.openLoopsIntroduced || []) loops.add(loop);
    for (const loop of scene.openLoopsResolved || []) loops.delete(loop);
    for (const prop of scene.propAnchors || []) props.set(prop.name, [...(props.get(prop.name) || []), { scene: scene.order, role: prop.role }]);
    return { scene: scene.id, chapter: scene.chapter, type: scene.sceneType, ending: scene.endingType, polarity: scene.valueCharge?.shift, activeLoops: [...loops] };
  });
  return { scenes, unresolvedLoops: [...loops], props: Object.fromEntries(props), limitations: ['These are intentions from scene cards, not proof of enactment. Final reader-promises review examines the revised prose.'] };
}

export function wordPositions(chapters: Chapter[]) {
  const total = chapters.reduce((sum, c) => sum + c.text.trim().split(/\s+/).filter(Boolean).length, 0);
  let words = 0;
  return { total, chapters: chapters.map(c => {
    const count = c.text.trim().split(/\s+/).filter(Boolean).length;
    const start = words;
    words += count;
    return { chapter: c.chapter, words: count, fromPercent: total ? start / total * 100 : 0, toPercent: total ? words / total * 100 : 0 };
  }) };
}

export function openingWindow(chapters: Chapter[]) {
  const words = chapters.map(c => c.text).join('\n\n').trim().split(/\s+/).filter(Boolean);
  return { firstPage: words.slice(0, 250).join(' '), firstTenPercent: words.slice(0, Math.max(1, Math.ceil(words.length * 0.1))).join(' ') };
}
