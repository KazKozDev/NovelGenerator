import React, { useState } from 'react';
import type { ChapterData } from '../types';

export default function ManuscriptRevision({ chapters, onRevise }: { chapters: ChapterData[]; onRevise: (number: number, content: string) => Promise<void> }) {
  const [number, setNumber] = useState(1);
  const [draft, setDraft] = useState(chapters[0]?.content || '');
  return <details className="mt-4">
    <summary className="cursor-pointer">Edit a chapter and recheck its consequences</summary>
    <label className="block mt-3">Chapter
      <select className="block w-full bg-zinc-900 p-2 mt-1" value={number} onChange={event => {
        const selected = Number(event.target.value); setNumber(selected); setDraft(chapters[selected - 1]?.content || '');
      }}>
        {chapters.map((chapter, index) => <option key={index} value={index + 1}>{index + 1}. {chapter.title}</option>)}
      </select>
    </label>
    <label className="block mt-3">Revised prose
      <textarea className="block w-full bg-zinc-950 text-zinc-200 p-3 mt-1" rows={14} value={draft} onChange={event => setDraft(event.target.value)} />
    </label>
    <button className="mt-3 underline" disabled={!draft.trim()} onClick={() => void onRevise(number, draft)}>Save revision and continue review</button>
  </details>;
}
