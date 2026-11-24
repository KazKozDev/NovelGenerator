import React, { useEffect, useRef, useState } from 'react';

export function speechChunks(text: string): string[] {
  const words = text.replace(/^#{1,6}\s+/gm, '').trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 150) chunks.push(words.slice(i, i + 150).join(' '));
  return chunks;
}

export default function ReaderTools({ text, compact }: { text: string; compact?: boolean }) {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const session = useRef(0);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const stop = () => { session.current++; if (supported) window.speechSynthesis.cancel(); setSpeaking(false); setPaused(false); };
  useEffect(() => { stop(); setProgress(0); return () => { session.current++; if (supported) window.speechSynthesis.cancel(); }; }, [text]);
  const play = () => {
    if (!supported) return;
    stop();
    const token = session.current;
    const chunks = speechChunks(text);
    setSpeaking(true); setError('');
    const next = (index: number) => {
      if (session.current !== token) return;
      setProgress(chunks.length ? Math.round(index / chunks.length * 100) : 100);
      if (index >= chunks.length) { setSpeaking(false); return; }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.onend = () => next(index + 1);
      utterance.onerror = event => { if (session.current === token) { stop(); setError(`Read aloud unavailable: ${event.error}`); } };
      window.speechSynthesis.speak(utterance);
    };
    next(0);
  };

  const controls = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        className="border border-zinc-700 hover:border-zinc-500 rounded px-3 py-1 text-zinc-200 transition-colors"
        onClick={play}
        disabled={!supported || !text.trim()}
      >
        Read aloud
      </button>
      {speaking && (
        <div className="flex items-center gap-2 text-xs bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700">
          <button
            type="button"
            className="text-zinc-300 hover:text-zinc-100 underline text-xs"
            onClick={() => {
              if (paused) window.speechSynthesis.resume();
              else window.speechSynthesis.pause();
              setPaused(!paused);
            }}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            className="text-zinc-300 hover:text-zinc-100 underline text-xs"
            onClick={stop}
          >
            Stop
          </button>
          <span className="font-mono text-zinc-400 tabular-nums text-xs" aria-live="polite">
            {progress}%
          </span>
        </div>
      )}
      {!supported && <span className="text-zinc-500 text-xs">Read aloud unavailable</span>}
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
    </div>
  );

  if (compact) {
    return controls;
  }

  return (
    <section className="border border-zinc-800 rounded p-4 space-y-3" aria-label="Reader workshop">
      {controls}
    </section>
  );
}
