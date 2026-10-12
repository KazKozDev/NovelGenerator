/** One setting written into the text of an env file: its line replaced, added, or (for an empty value) removed. Other lines are left as they are. */
export function setEnvLine(text: string, name: string, value: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error('Not a setting name');
  if (/[\r\n]/.test(value)) throw new Error('A setting is one line');
  const lines = text.split('\n'), is = (line: string) => new RegExp(`^\\s*${name}\\s*=`).test(line);
  const kept = lines.filter(line => !is(line));
  if (!value.trim()) return kept.join('\n');
  const at = lines.findIndex(is), row = `${name}=${value.trim()}`;
  if (at >= 0) return lines.map((line, index) => index === at ? row : line).filter((line, index) => index === at || !is(line)).join('\n');
  while (kept.length && !kept.at(-1)!.trim()) kept.pop();
  return [...kept, row, ''].join('\n');
}
