/**
 * A cover master drawn by ChatGPT in the author's own browser, through the WebOperator bridge
 * (github.com/KazKozDev/WebOperator), so no image API is paid for. The bridge drives the active browser tab:
 * a new chat, the prompt, a wait for the picture, then WebOperator's read-only browser.image returns its bytes.
 * A CAPTCHA, a sign-in page or a changed page stops the run and says so: nothing is solved or clicked through
 * on the author's behalf.
 */
import net from 'node:net';
import { randomUUID } from 'node:crypto';

const SOCKET = process.env.WEBOPERATOR_AGENT_SOCKET || '/tmp/weboperator-bridge.sock';
const TOKEN = process.env.WEBOPERATOR_API_TOKEN || '';

export interface SnapshotNode { ref: string; role: string; name: string; inViewport?: boolean; href?: string }
export interface Snapshot { url: string; title: string; nodes: SnapshotNode[] }

/** One request to the bridge over its socket, in Native Messaging frames. */
export function bridgeRequest(type: string, payload: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    let buffer = Buffer.alloc(0);
    const socket = net.createConnection(SOCKET, () => {
      const body = Buffer.from(JSON.stringify({ id, type, payload, timeoutMs, ...(TOKEN ? { token: TOKEN } : {}) }), 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32LE(body.length, 0);
      socket.write(Buffer.concat([header, body]));
    });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error(`WebOperator did not answer ${type} in time`)); }, timeoutMs + 5000);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0);
        if (buffer.length < 4 + length) return;
        const message = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
        buffer = buffer.subarray(4 + length);
        if (message.kind === 'event' || message.id !== id) continue;
        clearTimeout(timer);
        socket.end();
        if (message.error) reject(new Error(String(message.error)));
        else resolve(message.result);
        return;
      }
    });
    socket.on('error', error => {
      clearTimeout(timer);
      reject(new Error((error as any).code === 'ENOENT' || (error as any).code === 'ECONNREFUSED'
        ? 'WebOperator is not running: open Chrome with the WebOperator extension'
        : error.message));
    });
  });
}

/** The page as the extension sees it; right after a navigation its script may not be there yet, so it is asked again. */
export async function snapshot(): Promise<Snapshot> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await bridgeRequest('browser.snapshot', {});
      return result.snapshot as Snapshot;
    } catch (error) {
      if (attempt >= 15 || !/receiving end does not exist|could not establish connection|no tab with id/i.test(String(error))) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** What the page is, from the snapshot: the chat, a sign-in wall, or a CAPTCHA the author has to pass. */
export function pageState(snap: Snapshot): 'chat' | 'login' | 'captcha' | 'other' {
  const text = `${snap.title} ${snap.nodes.map(n => n.name).join(' ')}`.toLowerCase();
  if (/captcha|verify you are human|are you a robot|cloudflare/.test(text)) return 'captcha';
  if (!/chatgpt\.com|chat\.openai\.com/.test(snap.url)) return 'other';
  if (snap.nodes.some(n => n.role === 'button' && /^log in$|^sign up/i.test(n.name)) && !composer(snap)) return 'login';
  return 'chat';
}

/** The message box of the chat, not the box for editing an image. */
export function composer(snap: Snapshot): SnapshotNode | undefined {
  return snap.nodes.find(n => n.role === 'textbox' && !/edit/i.test(n.name));
}

export const generatedImages = (snap: Snapshot) => snap.nodes.filter(n => n.role === 'button' && /^Generated image \d+$/.test(n.name));
const generating = (snap: Snapshot) => snap.nodes.some(n => n.role === 'button' && /stop (streaming|generating)/i.test(n.name));

export interface ChatgptImageResult { data: string; mimeType: string; width: number; height: number }

/** The prompt as sent to ChatGPT: an explicit request for one vertical picture, then the prompt. */
export function chatgptMessage(prompt: string): string {
  return `Generate an image. One picture, vertical 2:3 (1024×1536), no text in it.\n\n${prompt.trim()}`;
}

/** Draws one picture in ChatGPT and returns it, or throws with what stopped it. */
export async function generateWithChatgpt(prompt: string, { timeoutMs = 300_000, log = (_: string) => {} } = {}): Promise<ChatgptImageResult> {
  const health = await bridgeRequest('bridge.health', {}, 10_000);
  if (health?.extension !== 'online') throw new Error('The WebOperator extension is not connected; open Chrome with it');

  log('opening a new ChatGPT chat');
  await bridgeRequest('browser.navigate', { url: 'https://chatgpt.com/' }, 60_000);
  let snap = await snapshot();
  for (let i = 0; i < 10 && !composer(snap) && pageState(snap) === 'chat'; i++) { await sleep(1000); snap = await snapshot(); }
  const state = pageState(snap);
  if (state === 'captcha') throw new Error('ChatGPT shows a CAPTCHA: pass it in Chrome, then try again');
  if (state === 'login') throw new Error('ChatGPT asks to sign in: sign in in Chrome, then try again');
  const box = composer(snap);
  if (state !== 'chat' || !box) throw new Error('The ChatGPT page did not show its message box');

  log('sending the prompt');
  await bridgeRequest('browser.type', { ref: box.ref, text: chatgptMessage(prompt), mode: 'replace', submit: 'false' }, 30_000);
  // The box takes the text but does not send it on its own: the Send button does, or Enter when there is none.
  await sleep(500);
  snap = await snapshot();
  const send = snap.nodes.find(n => n.role === 'button' && /^send( prompt| message)?$/i.test(n.name));
  if (send) await bridgeRequest('browser.click', { ref: send.ref, reason: 'send the prompt' }, 30_000);
  else await bridgeRequest('browser.press', { key: 'Enter', ref: box.ref }, 10_000);
  // A sent message opens the chat at /c/<id>; without that the prompt is still sitting in the box.
  let sent = false;
  for (let i = 0; i < 15 && !sent; i++) { await sleep(1000); sent = /\/c\//.test((await snapshot()).url); }
  if (!sent) throw new Error('ChatGPT did not take the prompt; the message box may have changed');

  // The picture is ready when its button is there and ChatGPT has stopped drawing.
  const started = Date.now();
  let image: SnapshotNode | undefined;
  while (Date.now() - started < timeoutMs) {
    await sleep(4000);
    snap = await snapshot();
    if (pageState(snap) === 'captcha') throw new Error('ChatGPT shows a CAPTCHA: pass it in Chrome, then try again');
    image = generatedImages(snap)[0];
    if (image && !generating(snap)) break;
    log(image ? 'the picture is being finished' : 'waiting for the picture');
  }
  if (!image || generating(snap)) throw new Error('ChatGPT did not finish a picture in time');
  await sleep(2500);

  log('reading the picture');
  let read: any;
  try {
    read = await bridgeRequest('browser.image', { ref: image.ref }, 60_000);
  } catch (error) {
    if (/unknown|unsupported/i.test(String(error))) throw new Error('This WebOperator has no browser.image yet: rebuild the extension and reload it in the browser');
    throw error;
  }
  if (!read?.base64) throw new Error('WebOperator returned no image');
  return { data: read.base64, mimeType: read.mimeType || 'image/png', width: read.width || 0, height: read.height || 0 };
}
