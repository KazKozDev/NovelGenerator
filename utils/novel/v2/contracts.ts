/** JSON object-key order is transport formatting; array order and values are story data. */
export function stableJson(value: unknown): string {
  const ordered = (item: any): any => Array.isArray(item) ? item.map(ordered)
    : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])]))
    : item;
  return JSON.stringify(ordered(value));
}
