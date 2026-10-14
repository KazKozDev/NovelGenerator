import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateHuggingFaceText, listHuggingFaceModels } from '../services/hfService';

const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const done = (content: string, finish_reason = 'stop') => reply({ provider: 'novita', usage: { prompt_tokens: 5, completion_tokens: 7 }, choices: [{ finish_reason, message: { content } }] });

describe('Hugging Face Inference Providers', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('sends an OpenAI-style request to the router with the token and reports usage and the serving provider', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token'); vi.stubEnv('HF_BASE_URL', '');
    const fetchMock = vi.fn(async () => done('Hello')); vi.stubGlobal('fetch', fetchMock);
    let metadata: any;
    expect(await generateHuggingFaceText('Hi', 'Be brief', 100, 'org/model:fastest', 0.3, value => { metadata = value; })).toBe('Hello');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, any];
    expect(url).toBe('https://router.huggingface.co/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'org/model:fastest', max_tokens: 100, temperature: 0.3, stream: true, messages: [{ role: 'system', content: 'Be brief' }, { role: 'user', content: 'Hi' }] });
    expect(metadata).toMatchObject({ finish_reason: 'stop', provider: 'novita', usage: { prompt_tokens: 5, completion_tokens: 7 } });
  });
  it('returns output-limit failure immediately for bounded audits without an internal repeat', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token');
    const fetchMock = vi.fn(async () => done('Incomplete JSON', 'length'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateHuggingFaceText('Audit', '', 8000, 'org/model', 0, undefined, { type: 'object' }, { retryOutputLimit: false })).rejects.toThrow('token limit');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, any])[1].body).max_tokens).toBe(8000);
  });
  it('asks for JSON, and repeats the request without the response format when a provider refuses it', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token');
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => { bodies.push(JSON.parse(init.body)); return bodies.length === 1 ? reply({ error: 'response_format unsupported' }, 400) : done('{"a":1}'); }));
    expect(await generateHuggingFaceText('Hi', undefined, 100, 'org/model', 0.2, undefined, { type: 'object' })).toBe('{"a":1}');
    expect(bodies[0].response_format).toEqual({ type: 'json_object' });
    expect(bodies[1].response_format).toBeUndefined();
    expect(bodies[1].messages[0].content).toContain('Return one JSON object');
  });
  it('refuses a cut-off or empty answer, a missing token and a missing model, and names a refused token', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token');
    vi.stubGlobal('fetch', vi.fn(async () => done('Half an ans', 'length')));
    await expect(generateHuggingFaceText('Hi', undefined, 10, 'org/model')).rejects.toThrow('token limit');
    vi.stubGlobal('fetch', vi.fn(async () => done('   ')));
    await expect(generateHuggingFaceText('Hi', undefined, 10, 'org/model')).rejects.toThrow('no final content');
    vi.stubGlobal('fetch', vi.fn(async () => reply({ error: 'Invalid credentials' }, 401)));
    await expect(generateHuggingFaceText('Hi', undefined, 10, 'org/model')).rejects.toThrow('[401]: API key not valid — the token was refused');
    await expect(generateHuggingFaceText('Hi', undefined, 10, '')).rejects.toThrow('Set a Hugging Face model');
    vi.stubEnv('HF_TOKEN', '');
    if (!(await import('node:fs')).existsSync('.env.local') || !/^HF_TOKEN=/m.test((await import('node:fs')).readFileSync('.env.local', 'utf8')))
      await expect(generateHuggingFaceText('Hi', undefined, 10, 'org/model')).rejects.toThrow('Set HF_TOKEN');
  });
  it('asks for half the length when a provider refuses the length asked for', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token');
    const asked: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => { const body = JSON.parse(init.body); asked.push(body.max_tokens); return body.max_tokens > 8192 ? reply({ error: 'max_tokens is too large: maximum 8192' }, 400) : done('Plan'); }));
    expect(await generateHuggingFaceText('Hi', undefined, 32768, 'org/model')).toBe('Plan');
    expect(asked).toEqual([32768, 16384, 8192]);
  });
  const stream = (events: object[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  it('reads a streamed answer, so that a long scene does not sit behind the gateway time-out', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token');
    vi.stubGlobal('fetch', vi.fn(async () => stream([{ provider: 'novita', choices: [{ delta: { content: 'Nora ' } }] }, { choices: [{ delta: { content: 'waited.' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, { choices: [], usage: { prompt_tokens: 9, completion_tokens: 2 } }])));
    let metadata: any;
    expect(await generateHuggingFaceText('Hi', undefined, 100, 'org/model', 0.2, value => { metadata = value; })).toBe('Nora waited.');
    expect(metadata).toMatchObject({ finish_reason: 'stop', provider: 'novita', usage: { prompt_tokens: 9, completion_tokens: 2 } });
  });
  it('asks again after a gateway time-out instead of ending the book, and says so when it keeps failing', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token');
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ++calls < 3 ? new Response('<html><head><title>504 Gateway Time-out</title></head></html>', { status: 504 }) : done('Recovered')));
    expect(await generateHuggingFaceText('Hi', undefined, 100, 'org/model')).toBe('Recovered');
    expect(calls).toBe(3);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><head><title>504 Gateway Time-out</title></head></html>', { status: 504 })));
    await expect(generateHuggingFaceText('Hi', undefined, 100, 'org/model')).rejects.toThrow('Hugging Face request failed [504] after several attempts. 504 Gateway Time-out');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('socket hang up'); }));
    await expect(generateHuggingFaceText('Hi', undefined, 100, 'org/model')).rejects.toThrow('after several attempts: socket hang up');
  });
  it('ends a stream that has gone silent and asks again, while a slow one that keeps sending is waited for', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token'); vi.stubEnv('HF_IDLE_MS', '40');
    const encoder = new TextEncoder();
    const event = (value: object) => encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
    let calls = 0; const restarts: string[] = []; let seen = '';
    vi.stubGlobal('fetch', vi.fn(async () => {
      const dead = ++calls === 1;
      const body = new ReadableStream<Uint8Array>({ async start(controller) {
        controller.enqueue(event({ choices: [{ delta: { content: dead ? 'Half a ' : 'Slow ' } }] }));
        if (dead) return; // …and then nothing, for ever.
        for (const piece of ['but ', 'alive.']) { await new Promise(resolve => setTimeout(resolve, 20)); controller.enqueue(event({ choices: [{ delta: { content: piece } }] })); }
        controller.enqueue(event({ choices: [{ delta: {}, finish_reason: 'stop' }] })); controller.close();
      } });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }));
    const text = await generateHuggingFaceText('Hi', undefined, 100, 'org/model', 0.2, undefined, undefined, { onDelta: piece => { seen += piece; }, onRestart: why => { restarts.push(why); seen = ''; } });
    expect(text).toBe('Slow but alive.');
    expect(calls).toBe(2);
    expect(restarts[0]).toContain('no data from the provider');
    expect(seen).toBe('Slow but alive.');
  });
  it('ends an answer that is only blank space as soon as it is seen, and asks again without JSON mode', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token');
    const modes: boolean[] = []; const restarts: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const json = !!JSON.parse(init.body).response_format; modes.push(json);
      return json ? stream([{ choices: [{ delta: { content: '{"tool":"finish","text":"' } }] }, ...Array.from({ length: 40 }, () => ({ choices: [{ delta: { content: ' \n'.repeat(25) } }] }))])
        : stream([{ choices: [{ delta: { content: '{"tool":"finish","text":"Nora waited."}' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }]);
    }));
    expect(await generateHuggingFaceText('Hi', undefined, 8192, 'org/model', 0.2, undefined, { type: 'object' }, { onRestart: why => restarts.push(why) })).toContain('Nora waited.');
    expect(modes).toEqual([true, false]);
    expect(restarts[0]).toContain('repeating itself or writing only blank space');
  });
  it('asks once more without JSON mode, and not for twice the room, when an answer ran to its limit', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token');
    const asked: [boolean, number][] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => { const body = JSON.parse(init.body); asked.push([!!body.response_format, body.max_tokens]); return body.response_format ? done('{"tool":"finish","text":"Half', 'length') : done('{"tool":"finish","text":"Whole."}'); }));
    expect(await generateHuggingFaceText('Hi', undefined, 8192, 'org/model', 0.2, undefined, { type: 'object' })).toContain('Whole.');
    expect(asked).toEqual([[true, 8192], [false, 8192]]);
  });
  it('asks for the answer without hidden reasoning, and drops that when a provider does not know it', async () => {
    vi.stubEnv('HF_TOKEN', 'test-token');
    const efforts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => { const body = JSON.parse(init.body); efforts.push(body.reasoning_effort); return body.reasoning_effort ? reply({ error: 'Unknown parameter: reasoning_effort' }, 400) : done('Plain'); }));
    expect(await generateHuggingFaceText('Hi', undefined, 100, 'org/model')).toBe('Plain');
    expect(efforts).toEqual(['none', undefined]);
  });
  it('lists what the router serves and through whom', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ data: [{ id: 'org/model', providers: [{ provider: 'novita' }, { provider: 'together' }] }, { nope: true }] })));
    expect(await listHuggingFaceModels()).toEqual([{ id: 'org/model', providers: ['novita', 'together'] }]);
  });
});
