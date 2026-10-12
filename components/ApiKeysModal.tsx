import React, { useEffect, useState } from 'react';

type Status = Record<string, { set: boolean; value?: string }>;
const ROWS: { name: string; label: string; hint: string; secret: boolean; placeholder: string }[] = [
  { name: 'GEMINI_API_KEY', label: 'Gemini', hint: 'Google AI Studio → Get API key.', secret: true, placeholder: 'Paste the key' },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic', hint: 'Anthropic Console → API keys.', secret: true, placeholder: 'Paste the key' },
  { name: 'HF_TOKEN', label: 'Hugging Face', hint: 'Hugging Face → Settings → Access Tokens, with permission to call Inference Providers.', secret: true, placeholder: 'Paste the token' },
  { name: 'QWEN_API_KEY', label: 'Qwen', hint: 'Alibaba Cloud Model Studio → API key.', secret: true, placeholder: 'Paste the key' },
  { name: 'QWEN_BASE_URL', label: 'Qwen endpoint', hint: 'The OpenAI-compatible address of your Model Studio region, ending in /v1.', secret: false, placeholder: 'https://…/compatible-mode/v1' },
];

/** The keys window: one row a provider. A key is saved to .env.local on this computer and is never shown again. */
export function ApiKeysModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<Status>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setTyped({}); setNote({}); setFailure('');
    fetch('/api/keys').then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not read the settings'); setStatus(data.keys || {}); })
      .catch(error => setFailure(error instanceof Error ? error.message : 'Could not read the settings'));
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const save = async (name: string, value: string) => {
    setNote(all => ({ ...all, [name]: 'Saving…' }));
    try {
      const response = await fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save');
      setStatus(data.keys || {}); setTyped(all => ({ ...all, [name]: '' })); setNote(all => ({ ...all, [name]: value ? 'Saved' : 'Removed' }));
    } catch (error) { setNote(all => ({ ...all, [name]: error instanceof Error ? error.message : 'Could not save' })); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="keys-title" className="relative w-full max-w-[640px] max-h-[94dvh] flex flex-col bg-zinc-900 light:bg-white border border-zinc-800 light:border-zinc-200 rounded-xl shadow-2xl overflow-hidden" onClick={event => event.stopPropagation()}>
      <header className="flex items-start gap-3 justify-between px-5 py-4 border-b border-zinc-800 light:border-zinc-200 bg-zinc-950/60 light:bg-zinc-50 shrink-0">
        <div className="min-w-0">
          <h2 id="keys-title" className="text-base font-semibold text-zinc-100 light:text-zinc-900">API keys</h2>
          <p className="mt-1 text-xs text-zinc-400 light:text-zinc-500">One key for each provider you want to use. Ollama needs none.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close API keys" title="Close (Esc)" className="shrink-0 p-1.5 text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-800 hover:bg-zinc-800 light:hover:bg-zinc-200 rounded-md transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </header>
      <div className="overflow-y-auto px-5 py-4 space-y-4">
        {failure && <p className="text-xs text-red-300/90 border border-red-900/60 bg-red-950/40 rounded px-3 py-2">{failure}</p>}
        {ROWS.map(row => {
          const here = status[row.name], value = typed[row.name] ?? '';
          return <form key={row.name} className="space-y-1.5" onSubmit={event => { event.preventDefault(); if (value.trim()) void save(row.name, value); }}>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`key-${row.name}`} className="block text-sm text-zinc-300 light:text-zinc-800 font-medium">{row.label}</label>
              <span className={`text-xs ${here?.set ? 'text-emerald-400/90' : 'text-zinc-500'}`} data-testid={`key-status-${row.name}`}>{here?.set ? '● Saved' : '○ Not set'}</span>
            </div>
            <div className="flex gap-2">
              <input id={`key-${row.name}`} type={row.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={value}
                onChange={event => setTyped(all => ({ ...all, [row.name]: event.target.value }))}
                placeholder={row.secret ? (here?.set ? 'Saved — paste a new one to replace it' : row.placeholder) : here?.value || row.placeholder}
                className="flex-1 min-w-0 bg-zinc-950 light:bg-white border border-zinc-800 light:border-zinc-300 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 light:text-zinc-900 placeholder-zinc-600 focus:outline-none focus:border-zinc-600" />
              <button type="submit" disabled={!value.trim()} className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-200 text-zinc-900 disabled:opacity-40">Save</button>
              {here?.set && <button type="button" onClick={() => void save(row.name, '')} className="px-3 py-1.5 rounded text-xs font-medium border border-zinc-800 light:border-zinc-300 text-zinc-400 hover:text-zinc-200 light:hover:text-zinc-800">Remove</button>}
            </div>
            <p className="text-xs text-zinc-500">{row.hint}{note[row.name] ? ` ${note[row.name]}.` : ''}</p>
          </form>;
        })}
      </div>
      <footer className="px-5 py-3 border-t border-zinc-800 light:border-zinc-200 text-xs text-zinc-500 shrink-0">
        Keys are written to <span className="font-mono">.env.local</span> on this computer, which git ignores, and are used by the local server. A saved key is never shown again, here or anywhere. Saving restarts the local server for a moment, so set your keys before you start a book.
      </footer>
    </div>
  </div>;
}

/** The button beside the guide's question mark. */
export default function ApiKeysToggle({ className = '' }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setIsOpen(true)} title="API keys" aria-label="Open API keys"
      className={`inline-flex items-center justify-center h-7 px-1.5 rounded-md border transition-all duration-200 text-[10px] font-semibold tracking-wide text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-900 border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 hover:border-zinc-700 light:border-zinc-300 light:border-zinc-200/80 light:bg-white light:hover:bg-zinc-100 shadow-sm ${className}`}>
      API
    </button>
    <ApiKeysModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
  </>;
}
