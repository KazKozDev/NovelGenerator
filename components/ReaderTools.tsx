import React, { useEffect, useRef, useState } from 'react';

export function speechChunks(text: string): string[] {
  const words = text.replace(/^#{1,6}\s+/gm, '').trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 150) chunks.push(words.slice(i, i + 150).join(' '));
  return chunks;
}

export default function ReaderTools({ text }: { text: string }) {
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
  return <section className="border border-zinc-800 rounded p-4 space-y-3" aria-label="Reader workshop">
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <button type="button" className="border border-zinc-700 rounded px-3 py-1" onClick={play} disabled={!supported || !text.trim()}>Read aloud</button>
      {speaking && <><button type="button" onClick={() => { if (paused) window.speechSynthesis.resume(); else window.speechSynthesis.pause(); setPaused(!paused); }}>{paused ? 'Resume audio' : 'Pause audio'}</button><button type="button" onClick={stop}>Stop audio</button><span aria-live="polite">{progress}% listened</span></>}
      {!supported && <span>Read aloud is unavailable in this browser.</span>}
    </div>
    {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
  </section>;
}
