import { describe, expect, it } from 'vitest';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const page = (url: string, nodes: [string, string][], title = 'ChatGPT') =>
  ({ url, title, nodes: nodes.map(([role, name], i) => ({ ref: `@e${i + 1}`, role, name })) });

describe('ChatGPT page reading', async () => {
  const { pageState, composer, generatedImages, chatgptMessage } = await import('../services/chatgptImage');

  it('tells the chat from a sign-in wall and a CAPTCHA', () => {
    expect(pageState(page('https://chatgpt.com/', [['textbox', 'Ask ChatGPT'], ['button', 'Send']]))).toBe('chat');
    expect(pageState(page('https://chatgpt.com/', [['button', 'Log in'], ['button', 'Sign up for free']]))).toBe('login');
    expect(pageState(page('https://chatgpt.com/', [['generic', 'Verify you are human']]))).toBe('captcha');
    expect(pageState(page('https://example.com/', [['textbox', 'Search']]))).toBe('other');
  });

  it('finds the message box, not the image-editing box, and the finished pictures', () => {
    const snap = page('https://chatgpt.com/c/1', [['textbox', 'Describe edits'], ['textbox', 'Ask ChatGPT'], ['button', 'Generated image 1'], ['button', 'Edit generated image 1']]);
    expect(composer(snap)?.name).toBe('Ask ChatGPT');
    expect(generatedImages(snap).map(n => n.name)).toEqual(['Generated image 1']);
  });

  it('asks for one vertical picture without text, then gives the prompt as written', () => {
    expect(chatgptMessage(' A key on a sheet. ')).toBe('Generate an image. One picture, vertical 2:3 (1024×1536), no text in it.\n\nA key on a sheet.');
  });
});

describe('WebOperator bridge requests', () => {
  it('speaks length-prefixed JSON frames over the socket and skips events', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'wo-'));
    const socketPath = path.join(dir, 'bridge.sock');
    const frame = (value: unknown) => { const body = Buffer.from(JSON.stringify(value)); const head = Buffer.alloc(4); head.writeUInt32LE(body.length, 0); return Buffer.concat([head, body]); };
    const server = net.createServer(socket => {
      socket.once('data', data => {
        const request = JSON.parse(data.subarray(4, 4 + data.readUInt32LE(0)).toString());
        socket.write(frame({ kind: 'event', event: { kind: 'task:update' } }));
        socket.write(frame({ id: request.id, result: { echoed: request.type, ref: request.payload.ref } }));
      });
    });
    await new Promise<void>(resolve => server.listen(socketPath, resolve));
    process.env.WEBOPERATOR_AGENT_SOCKET = socketPath;
    try {
      const { vi } = await import('vitest');
      vi.resetModules();
      const { bridgeRequest } = await import('../services/chatgptImage');
      expect(await bridgeRequest('browser.image', { ref: '@e224' })).toEqual({ echoed: 'browser.image', ref: '@e224' });
    } finally {
      delete process.env.WEBOPERATOR_AGENT_SOCKET;
      server.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
