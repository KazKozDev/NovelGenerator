/**
 * What to show of an answer while it is still arriving. A writer's answer is a tool command
 * in JSON — {"tool":"finish","text":"…"} or {"tool":"replace","edits":[{…,"after":"…"}]} —
 * so the stream is escaped text inside a structure that is not closed yet. This reads out the
 * prose that has arrived so far, and leaves a plain-text answer as it is.
 */
const unescape = (value: string): string => {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char !== '\\') { out += char; continue; }
    const next = value[++i];
    if (next === undefined) break;
    if (next === 'n') out += '\n'; else if (next === 't') out += '\t'; else if (next === 'r') out += '';
    else if (next === 'u') { const code = value.slice(i + 1, i + 5); if (code.length < 4) break; out += String.fromCharCode(parseInt(code, 16) || 32); i += 4; }
    else out += next;
  }
  return out;
};
/** The string value that starts at `from` (just after its opening quote), as far as it has arrived. */
const stringFrom = (raw: string, from: number): string => {
  let end = from;
  while (end < raw.length && raw[end] !== '"') end += raw[end] === '\\' ? 2 : 1;
  return unescape(raw.slice(from, Math.min(end, raw.length)));
};
export function livePreview(raw: string): string {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('```')) return raw;
  const values = (key: string) => [...raw.matchAll(new RegExp(`"${key}"\\s*:\\s*"`, 'g'))].map(match => stringFrom(raw, match.index! + match[0].length));
  const text = values('text').sort((a, b) => b.length - a.length)[0];
  if (text && text.length > 40) return text;
  const edits = values('after').filter(value => value.trim());
  if (edits.length) return edits.join('\n\n· · ·\n\n');
  return text || '';
}
