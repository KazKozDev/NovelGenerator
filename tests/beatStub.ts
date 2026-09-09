/**
 * The planned beats an extraction prompt is asking about. A fixture that answers with all of them
 * stands for a chapter that wrote every beat it planned; answering with fewer is how a test says a
 * scene never reached the page.
 */
export function plannedBeatsFrom(prompt: string): { sceneId: string; beat: string }[] {
  const marker = 'PLANNED BEATS FOR THIS CHAPTER:\n';
  const start = prompt.indexOf(marker);
  if (start === -1) return [];
  return JSON.parse(prompt.slice(start + marker.length).split('\n')[0]);
}
