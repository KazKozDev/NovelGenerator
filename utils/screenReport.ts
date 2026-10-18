/**
 * What the person sees, told to the agent: the app writes a description of its screen — the visible text,
 * dialogs, errors shown, the field being typed in, the selection, the settings kept in this browser — to the
 * dev server, which keeps it beside the books. The agent reads it with see_app. Nothing is sent anywhere else.
 */
export interface ScreenState {
  version: 1;
  at: string;
  url: string;
  visible: boolean;
  viewport: { width: number; height: number };
  /** The text on screen, top to bottom, as the person reads it. */
  text: string;
  dialogs: string[];
  errors: string[];
  focus?: { what: string; value?: string };
  selection?: string;
  busy: string[];
  settings: Record<string, unknown>;
}

const SECRET = /key|token|secret|password|credential/i;
const MOST_TEXT = 24000;

/** The app's own settings kept in this browser, without secrets or pictures. */
export function browserSettings(store: Pick<Storage, 'length' | 'key' | 'getItem'>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < store.length; i++) {
    const name = store.key(i);
    if (!name || !/^(novelGenerator_|novel_imprint|novel_author)/.test(name) || SECRET.test(name)) continue;
    const raw = store.getItem(name) || '';
    if (raw.length > 20000 || raw.startsWith('data:')) continue;
    try {
      const value = JSON.parse(raw);
      out[name] = value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET.test(k))) : value;
    } catch { out[name] = raw; }
  }
  return out;
}

const label = (el: Element): string => {
  const own = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || el.id;
  const labelled = el.id ? el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '';
  return `${el.tagName.toLowerCase()}${labelled || own ? ` "${(labelled || own || '').trim().slice(0, 80)}"` : ''}`;
};

const onScreen = (el: Element): boolean => {
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
};

/** Read the screen as it is now. */
export function readScreen(doc: Document = document): ScreenState {
  const lines: string[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  // Text side by side on one row of the screen reads as one line, as the person reads it: a label and its number.
  let size = 0, last: DOMRect | null = null;
  const range = doc.createRange();
  for (let node = walker.nextNode(); node && size < MOST_TEXT; node = walker.nextNode()) {
    const text = node.textContent?.replace(/\s+/g, ' ').trim();
    const parent = node.parentElement;
    if (!text || !parent || parent.closest('script,style,[aria-hidden="true"]') || !onScreen(parent)) continue;
    if (getComputedStyle(parent).visibility === 'hidden') continue;
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    const sameRow = last && lines.length && box.top < last.bottom - 2 && box.bottom > last.top + 2 && box.left >= last.left && box.left - last.right < 160;
    if (sameRow) lines[lines.length - 1] += ` ${text}`;
    else lines.push(text);
    last = box;
    size += text.length + 1;
  }
  const field = doc.activeElement;
  const typing = field && field !== doc.body && /^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName) ? field as HTMLInputElement : null;
  const secret = typing && (typing.type === 'password' || SECRET.test(label(typing)));
  const errors = [...doc.querySelectorAll('[role="alert"], .text-red-400, .text-red-500, .text-red-300')]
    .filter(onScreen).map(el => el.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean);
  for (const line of lines) if (/^(error|failed|ошибка)\b|request failed|timed out/i.test(line) && !errors.includes(line)) errors.push(line);
  return {
    version: 1,
    at: new Date().toISOString(),
    url: location.pathname + location.hash,
    visible: doc.visibilityState === 'visible',
    viewport: { width: innerWidth, height: innerHeight },
    text: lines.join('\n').slice(0, MOST_TEXT),
    dialogs: [...doc.querySelectorAll('[role="dialog"]')].filter(onScreen).map(el => el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 4000) || ''),
    errors: errors.map(e => e.slice(0, 1500)).slice(0, 20),
    ...(field && field !== doc.body ? { focus: { what: label(field), ...(typing && !secret ? { value: typing.value.slice(0, 4000) } : {}) } } : {}),
    ...((() => { const s = getSelection()?.toString().trim(); return s ? { selection: s.slice(0, 4000) } : {}; })()),
    busy: [...doc.querySelectorAll('[aria-busy="true"], .animate-spin')].filter(onScreen).map(el => (el.closest('[aria-label],[title]')?.getAttribute('aria-label') || el.parentElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean),
    settings: (() => { try { return browserSettings(localStorage); } catch { return {}; } })(),
  };
}

/** Send the screen to the dev server whenever it changes, every two seconds at most. */
export function startScreenReport(every = 2000): () => void {
  let last = '';
  const send = () => {
    let state: ScreenState;
    try { state = readScreen(); } catch { return; }
    const { at: _at, ...content } = state;
    const key = JSON.stringify(content);
    if (key === last) return;
    last = key;
    void fetch('/api/screen-state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }).catch(() => { last = ''; });
  };
  const timer = setInterval(send, every);
  const now = () => setTimeout(send, 50);
  document.addEventListener('visibilitychange', now);
  addEventListener('focusin', now);
  addEventListener('mouseup', now);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', now); removeEventListener('focusin', now); removeEventListener('mouseup', now); };
}
