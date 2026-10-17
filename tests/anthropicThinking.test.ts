import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: any[] = [];
let refuse: ((params: any) => Error | undefined) | undefined;
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: (params: any) => {
        calls.push(params);
        const error = refuse?.(params);
        return {
          on: () => {},
          finalMessage: async () => {
            if (error) throw error;
            return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } };
          },
        };
      },
    };
    models = { list: async function* () {} };
  },
}));

const between = () => Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"To turn thinking off on this model, send \\"thinking\\": {\\"type\\": \\"between_tools\\"} instead of {\\"type\\": \\"disabled\\"}."}}'), { status: 400 });

describe('turning thinking off per model', () => {
  beforeEach(() => { calls.length = 0; refuse = undefined; process.env.ANTHROPIC_API_KEY = 'test-key'; delete process.env.ANTHROPIC_EFFORT; });

  it('sends between_tools to Claude Sonnet 5.5 and low effort to Claude Opus 5.5', async () => {
    const { generateAnthropicLive } = await import('../services/anthropicService');
    await generateAnthropicLive('hi', undefined, 100, 'claude-sonnet-5-5');
    expect(calls[0].thinking).toEqual({ type: 'between_tools' });
    expect(calls[0].output_config).toBeUndefined();
    await generateAnthropicLive('hi', undefined, 100, 'claude-opus-5-5');
    expect(calls[1].thinking).toEqual({ type: 'adaptive' });
    expect(calls[1].output_config).toEqual({ effort: 'low' });
    await generateAnthropicLive('hi', undefined, 100, 'claude-haiku-5-5');
    expect(calls[2].thinking).toEqual({ type: 'disabled' });
  });

  it('learns between_tools from the 400 a new model answers with, and asks again', async () => {
    const { generateAnthropicLive, generateAnthropicText } = await import('../services/anthropicService');
    refuse = params => (params.thinking.type === 'disabled' ? between() : undefined);
    expect(await generateAnthropicLive('hi', undefined, 100, 'claude-new-model')).toBe('ok');
    expect(calls.map(c => c.thinking.type)).toEqual(['disabled', 'between_tools']);
    expect(await generateAnthropicText('hi', undefined, 100, 'claude-other-model')).toBe('ok');
    expect(calls.slice(2).map(c => c.thinking.type)).toEqual(['disabled', 'between_tools']);
  });
});
