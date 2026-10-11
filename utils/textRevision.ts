/** Keep unchanged text outside the highlighted replacement. */
export function textRevision(before:string,after:string) {
  let start=0,end=0;
  while(start<before.length&&start<after.length&&before[start]===after[start])start++;
  while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;
  const letter=(value:string|undefined)=>Boolean(value&&/[\p{L}\p{N}]/u.test(value));
  while(start>0&&letter(after[start-1])&&(letter(after[start])||letter(before[start])))start--;
  while(end>0&&letter(after[after.length-end])&&(letter(after[after.length-end-1])||letter(before[before.length-end-1])))end--;
  return {prefix:after.slice(0,start),removed:before.slice(start,before.length-end),added:after.slice(start,after.length-end),suffix:after.slice(after.length-end)};
}
