/**
 * Structured answers arrive shaped by the model, not by the schema: a JSON schema
 * pins the top-level keys, and list entries still come back as objects when a model
 * decides a string deserves a wrapper. Everything that reads a list out of an LLM
 * answer normalizes it here, so one field never gets `[object Object]` because it
 * was read three lines away from the field that was hardened.
 */

export function describeUnknown(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(describeUnknown).filter(Boolean).join('; ');
  if (!value || typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  if (typeof item.character_id === 'string' && typeof item.intention === 'string') {
    const reason = typeof item.reason_now === 'string' ? item.reason_now
      : typeof item.reason === 'string' ? item.reason : '';
    return `${item.character_id}: ${item.intention}${reason ? ` (${reason})` : ''}`;
  }
  for (const key of ['description', 'consequence', 'commitment', 'intention', 'decision', 'action', 'question', 'content', 'outcome', 'requirement', 'problem']) {
    if (typeof item[key] === 'string') return (item[key] as string).trim();
  }
  try { return JSON.stringify(value); } catch { return ''; }
}

export function unique(items: unknown[]): string[] {
  return [...new Set(items.map(describeUnknown).filter(Boolean))];
}

/** A list field that may not be a list at all when the model improvises. */
export function stringList(value: unknown): string[] {
  return unique(Array.isArray(value) ? value : value == null ? [] : [value]);
}

/** Text matched for identity, not for display: case and spacing are not the difference. */
export function matchKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '');
}
