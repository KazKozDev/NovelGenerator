import { marked } from 'marked';

export interface MarkdownRevisionBlock { before: string; after: string; changed: boolean }
/** Align complete Markdown blocks so headings, lists and tables retain their syntax. */
export function markdownRevision(before: string, after: string): MarkdownRevisionBlock[] {
  const blocks = (text: string) => marked.lexer(text).filter(token => token.type !== 'space').map(token => token.raw);
  // Space tokens are excluded from alignment, but joining independent blocks
  // must restore their boundaries (otherwise two paragraphs become one).
  const join = (parts: string[]) => parts.map(part => part.trimEnd()).join('\n\n');
  const left = blocks(before), right = blocks(after);
  if (left.length * right.length > 250000) {
    let start = 0, end = 0;
    while (left[start] === right[start] && start < Math.min(left.length, right.length)) start++;
    while (end < Math.min(left.length, right.length) - start && left[left.length - 1 - end] === right[right.length - 1 - end]) end++;
    return [...right.slice(0, start).map(after => ({before:after,after,changed:false})),
      {before:join(left.slice(start,left.length-end)),after:join(right.slice(start,right.length-end)),changed:true},
      ...right.slice(right.length-end).map(after => ({before:after,after,changed:false}))];
  }
  const lengths = Array.from({length:left.length+1}, () => new Uint32Array(right.length+1));
  for (let i=left.length-1;i>=0;i--) for (let j=right.length-1;j>=0;j--) lengths[i][j] = left[i] === right[j] ? 1+lengths[i+1][j+1] : Math.max(lengths[i+1][j],lengths[i][j+1]);
  const output: MarkdownRevisionBlock[] = [];
  let i=0,j=0;
  let removed: string[]=[],added: string[]=[];
  const flush = () => { if (removed.length || added.length) output.push({before:join(removed),after:join(added),changed:true}); removed=[]; added=[]; };
  while (i<left.length || j<right.length) {
    if (i<left.length && j<right.length && left[i]===right[j]) { flush(); output.push({before:left[i],after:right[j],changed:false}); i++;j++; }
    else if (i<left.length && (j===right.length || lengths[i+1][j]>=lengths[i][j+1])) removed.push(left[i++]);
    else added.push(right[j++]);
  }
  flush(); return output;
}
