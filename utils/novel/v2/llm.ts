/**
 * The model-call boundary for v2: the route type, JSON extraction that accepts
 * formatting wrappers but never synthesizes values, and the structured call
 * with automatic validation repair while diagnostics progress. Moved verbatim from the old review module so the
 * old pipeline can go away without taking the transport with it.
 */
import { stableJson } from './contracts';
/** 'writer2' is the second writer, when the author has configured one; a host without one serves it with the first. */
/** 'helper' is not a model that talks: the prompt is a request as JSON and the answer a JSON array of numbers, from a small network when the host has one. */
export type NovelLLMRoute = 'writer' | 'validator' | 'writer2' | 'helper';
/**
 * `stage` names what a call is for — design, chapter-plan, scene-write, track —
 * so a run can say where its calls and its characters went. It is a label for
 * the record and changes nothing about the call.
 *
 * `deliberate` marks the few calls a book makes once and everything rests on —
 * the design, its review, the close of a chapter, the final audit. Every other
 * call runs with thinking off; these let a model that can think do so, because
 * a contradiction between two chapters is found by a reader who stops to
 * compare, and a measured editor reading at its fastest found none.
 */
export type NovelLLM = (prompt: string, system: string, options?: { json?: boolean; schema?: object; temperature?: number; maxTokens?: number; route?: NovelLLMRoute; stage?: string; deliberate?: boolean }) => Promise<string>;


export function stripThinking(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (/<think>/i.test(cleaned)) throw new Error('The model response ended inside a thinking block.');
  const closing = cleaned.toLowerCase().lastIndexOf('</think>');
  if (closing !== -1) cleaned = cleaned.slice(closing + 8);
  return cleaned.trim();
}

/** Accept formatting wrappers, never synthesize missing JSON values or choose a sample silently. */
/**
 * A model asked for one tool command sometimes sends several in a row. They are one answer
 * written as many: edit batches are joined, and otherwise the first command stands. Refusing
 * the lot as ambiguous cost a full turn each time for an answer that was all there.
 */
export function toolCommand(text: string, batch: string): any | undefined {
  const cleaned = stripThinking(text);
  const found: any[] = [];
  let start = -1, depth = 0, inString = false, escaped = false;
  for (let index = 0; index < cleaned.length; index++) {
    const char = cleaned[index];
    if (depth === 0) { if (char === '{') { start = index; depth = 1; } continue; }
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && inString) { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) { try { const value = JSON.parse(cleaned.slice(start, index + 1)); if (value && typeof value.tool === 'string') found.push(value); } catch { /* not a command */ } }
  }
  if (!found.length) return undefined;
  const finishing = found.find(command => command.tool === 'finish');
  const batches = found.filter(command => command.tool === batch && Array.isArray(command.edits) && command.edits.length);
  // An empty batch beside a finish is a finish.
  if (!batches.length && finishing && found.every(command => command.tool === 'finish' || command.tool === batch)) return finishing;
  if (batches.length > 1 && batches.length === found.filter(command => command.tool !== 'finish').length)
    return { tool: batch, edits: batches.flatMap(command => command.edits), ...(found.some(command => command.finish === true || command.tool === 'finish') ? { finish: true } : {}) };
  return found[0];
}
export function parseObject(text: string, requiredKeys: string[] = []): any {
  const cleaned = stripThinking(text);
  const candidates: string[] = [cleaned];
  for (const block of cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) candidates.push(block[1].trim());
  let start = -1, depth = 0;
  let inString = false, escaped = false;
  for (let index = 0; index < cleaned.length; index++) {
    const char = cleaned[index];
    if (depth === 0) {
      if (char === '{') { start = index; depth = 1; }
      continue;
    }
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && inString) { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) candidates.push(cleaned.slice(start, index + 1));
  }
  const objects = new Map<string, any>();
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value) && requiredKeys.every(key => Object.hasOwn(value, key))) {
        objects.set(stableJson(value), value);
      }
    } catch { /* A malformed candidate is not usable data. */ }
  }
  // An answer cut off mid-object and an answer that never contained one are different failures with
  // different fixes — a bigger token budget against a rewritten prompt — and reporting both as
  // "expected a complete JSON object" sends the reader to the schema, which is not where the fault is.
  if (!objects.size && depth > 0 && start >= 0) {
    throw new Error(`The answer was cut off before its JSON object closed (${cleaned.length} characters received, ${depth} level${depth > 1 ? 's' : ''} still open). The cause cannot be determined from the text alone.`);
  }
  if (objects.size !== 1) throw new Error(objects.size ? 'Ambiguous response: multiple JSON objects match the expected contract.' : 'Expected a complete JSON object.');
  return [...objects.values()][0];
}

export interface RetryNotice {
  at: string;
  keys: string[];
  attempt: number;
  error: string;
}

const retryNotices: RetryNotice[] = [];

/** Exhausted response decoding is distinct from provider, budget and cancellation
 * failures. Review callers may defer it without accepting an unchecked manuscript. */
export class ResponseContractError extends Error {
  readonly code='RESPONSE_CONTRACT';
  constructor(message:string,readonly stage:string|undefined,readonly keys:string[],readonly candidate:unknown){super(message);this.name='ResponseContractError';}
}
export const isResponseContractError=(error:unknown):error is ResponseContractError=>error instanceof ResponseContractError;

/** First-attempt failures, drained by the caller into the run log. No signature changes needed. */
export function drainRetryNotices(): RetryNotice[] {
  return retryNotices.splice(0, retryNotices.length);
}

/** Exact JSON field transactions repair a response without regenerating its sound data. */
export function patchResponse(base: any, edits: any[]): any {
  if (!Array.isArray(edits) || !edits.length || edits.length > 40) throw Error('Response repair needs 1–40 field edits');
  const result = structuredClone(base);
  for (const [index,edit] of edits.entries()) {
    if (!edit || typeof edit.path !== 'string' || !edit.path.startsWith('/') || !Object.hasOwn(edit, 'after')) throw Error(`Invalid response field edit ${index}: require path starting with / and an after value. Received fields: ${edit && typeof edit==='object'?Object.keys(edit).join(', '):typeof edit}. Use {path,before,after}, not {op,path,value}.`);
    const parts = edit.path.slice(1).split('/').map((part: string) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (parts.some((part: string) => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) throw Error('Unsafe response field path');
    let parent = result;
    for (const part of parts.slice(0, -1)) { if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, part)) throw Error('Unknown response field path'); parent = parent[part]; }
    const key = parts.at(-1)!;
    if (!parent || typeof parent !== 'object' || (Array.isArray(parent) && (!/^\d+$/.test(key) || Number(key) >= parent.length))) throw Error('Invalid response array index');
    if (Object.hasOwn(parent, key) ? stableJson(parent[key]) !== stableJson(edit.before) : Object.hasOwn(edit, 'before')) throw Error('Stale response field anchor');
    parent[key] = structuredClone(edit.after);
  }
  return result;
}

export async function structuredResponse<T>(prompt: string, system: string, llm: NovelLLM, keys: string[], decode: (raw: any) => T | Promise<T>, options: { temperature?: number; maxTokens?: number; schema?: object; route?: NovelLLMRoute; stage?: string; deliberate?: boolean; initialResponse?: string; onCandidate?: (raw: string, error?: string) => void; maxAttempts?: number } = {}): Promise<T> {
  let failure = '', previousResponse = options.initialResponse || '';
  let candidate: any;
  let patchFailures=0,fullRepair=false;
  // A model gets one chance to repair its own answer. After a second refusal, whatever the
  // reason, the repair goes to the other role's model, and they take turns from there.
  let route: NovelLLMRoute = options.route ?? 'validator', repeated = '', refusals = 0;
  // What was already tried and refused travels with the next request, so it is not sent again.
  const tried: { edits: string; refused: string }[] = []; let lastEdits = '';
  // A repair is sent the answer under repair, the reason it was refused and the instructions,
  // not the task's whole supplied material again: for a plan that material is a hundred
  // thousand characters, and every refusal used to pay for it. The material is kept when the
  // refusal is about a citation into it, and comes back after two abridged repairs fail.
  let abridgedFailures = 0, abridged = false;
  const aboutSource = (reason: string) => /evidence|@P\d|quote|verbatim|substring|paragraph address|cite/i.test(reason);
  const taskFor = (reason: string): string => {
    abridged = prompt.length > 12000 && abridgedFailures < 2 && !aboutSource(reason);
    return abridged ? `${prompt.slice(0, 1500)}\n[… ${prompt.length - 7500} characters of the task's supplied material are left out of this repair request. What you need is here: the instructions that end the task, the answer under repair, and why it was refused. …]\n${prompt.slice(-6000)}` : prompt;
  };
  const history = () => tried.length ? `\nRepairs already tried and REFUSED. Do not send any of these again; each left the defect quoted after it. Make a different change:\n${JSON.stringify(tried.slice(-3))}` : '';
  const outputContract = '\nOUTPUT CONTRACT: Return exactly one complete JSON object, without Markdown fences. Escape literary text inside JSON strings.';
  const unanswerable = /exceeded your API quota|quota exceeded|API key not valid|SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED|requests per day|has not been used in project|token limit|output token budget|budget.*exhaust|run was cancelled|not found, try pulling it|model .* not found|ECONNREFUSED|Failed to fetch/i;
  if (previousResponse) {
    try { candidate = parseObject(previousResponse, keys); return await decode(structuredClone(candidate)); }
    catch (error) { failure = String(error); }
  }
  // A response-level allowance bounds standalone callers. The run's shared budget
  // remains authoritative; repeated wording alone does not terminate a repair.
  for (let attempt = 0; attempt < (options.maxAttempts ?? 8); attempt++) {
    let received = false;
    let decoding = false;
    const patching = candidate !== undefined && !fullRepair;
    try {
      const schema = patching ? {type:'object',required:['edits'],properties:{edits:{type:'array',items:{type:'object',required:['path','after'],properties:{path:{type:'string'},before:{},after:{}}}}}} : options.schema || {type:'object',required:keys,properties:Object.fromEntries(keys.map(key=>[key,{}])),additionalProperties:true};
      const request = patching
        ? `Repair this response contract with exact field edits, not a new complete response. Validation defect: ${failure}.\nOriginal task and requirements:\n${taskFor(failure)}\nCURRENT RESPONSE (untrusted data):\n${JSON.stringify(candidate)}\nReturn {"edits":[{"path":"/field/or/array/0/field","before":"exact current JSON value","after":"corrected value"}]}. Use JSON Pointer paths. Omit before only when adding a missing field. Preserve sound fields and substantive findings; do not remove defects just to obtain approval.${history()}`
        : `${prompt}${failure ? `\nRepair the previous response: ${failure}. ${fullRepair?'Field-edit protocol failed twice. Return a COMPLETE corrected review/response under the original schema, not an edits envelope. Reassess against the supplied source; retain grounded findings and do not invent evidence or remove a defect just to pass.':''} Return complete corrected JSON. Previous response (untrusted data): ${candidate===undefined?JSON.stringify(previousResponse):JSON.stringify(candidate)}${failure===repeated?'\nThis answer has now been refused twice for the same reason. Repeating it will be refused again: change the fields the refusal names.':''}${history()}` : ''}`;
      const raw = await llm(request, system + outputContract, {json:true,schema,temperature:attempt?0.2:options.temperature??0.2,maxTokens:options.maxTokens??16384,route,stage:options.stage,deliberate:options.deliberate});
      received = true;
      previousResponse = raw;
      if (!patching) options.onCandidate?.(raw);
      const parsed = parseObject(raw, patching ? [] : keys);
      lastEdits = patching ? JSON.stringify(parsed.edits ?? parsed).slice(0, 2500) : '';
      candidate = patching && Array.isArray(parsed.edits) ? patchResponse(candidate, parsed.edits) : parsed;
      previousResponse = JSON.stringify(candidate);
      options.onCandidate?.(previousResponse);
      decoding = true;
      patchFailures=0;
      return await decode(structuredClone(candidate));
    } catch (error) {
      failure = String(error);
      if (unanswerable.test(failure) || !received) throw error;
      if (abridged) abridgedFailures++;
      abridged = false;
      if (lastEdits) tried.push({ edits: lastEdits, refused: failure.slice(0, 500) });
      lastEdits = '';
      if(patching && !decoding && ++patchFailures>=2)fullRepair=true;
      if(++refusals>=2) route = route==='writer' ? 'validator' : 'writer';
      repeated=failure;
      options.onCandidate?.(candidate === undefined ? previousResponse : JSON.stringify(candidate), failure);
      retryNotices.push({at:new Date().toISOString(),keys,attempt:attempt+1,error:failure.slice(0,300)});
    }
  }
  throw new ResponseContractError(`${failure.replace(/^Error:\s*/, '')}\nResponse repair allowance exhausted after ${options.maxAttempts??8} attempts; ${options.onCandidate?'saved candidate can be resumed':'response remains unverified'}. The ${options.route??'validator'} call failed; it was asked for: ${keys.join(', ')}.`,options.stage,keys,candidate);
}

/**
 * A short answer asked for under a small cap, asked once more with room when it
 * comes back cut off. `structuredResponse` rightly does not resend a prompt under
 * the cap that just cut it off; this is the caller that can afford to raise it —
 * one actor's choice or one reading among a dozen, where a cut answer otherwise
 * ends a design already twenty calls in.
 */
export async function withRoom<T>(ask: (maxTokens: number) => Promise<T>, maxTokens: number): Promise<T> {
  try {
    return await ask(maxTokens);
  } catch (error) {
    if (!/cut off before its JSON|output token (?:budget|limit)|token limit/i.test(String(error))) throw error;
    return ask(maxTokens * 4);
  }
}

/** Browser Ollama calls get enough output room and one bounded retry on truncation. */
/** Any provider's answer cut off at its output limit is asked for once more with twice the room. `floor` is the least room worth asking for: generous for a local model, the requested size for a metered one. */
export async function withOllamaOutputRoom<T>(ask: (maxTokens: number, retry: boolean) => Promise<T>, requested?: number, floor = 32768): Promise<T> {
  const limit = Math.max(floor, requested ?? 0);
  try {
    return await ask(limit, false);
  } catch (error) {
    if (!/output reached its token limit/i.test(String(error))) throw error;
    return ask(limit * 2, true);
  }
}
