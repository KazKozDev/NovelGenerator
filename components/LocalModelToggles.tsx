import React, { useState } from 'react';
import { DEEPCHECK_EMOTION_KEY, DEEPCHECK_GENRE_KEY, DEEPCHECK_LANG_KEY, DEEPCHECK_NLI_KEY, SUMMARIZER_KEY, isLocalModelOn, setLocalModel } from '../utils/novel/deepCheck';
import { RERANK_STORAGE_KEY } from '../utils/novel/reranker';

/**
 * Switches for the local Hugging Face models. The opt-in ones default off:
 * enabling one downloads its weights on first use (hundreds of MB), and
 * that decision belongs to the reader. Offered where a run has stopped,
 * next to the model switch — the next attempt reads these keys.
 *
 * The cross-encoder is the exception and is listed apart: it is on by
 * default, it is the heaviest of them all, and a reader whose tab stops
 * answering needs to be able to find it.
 */
const MODELS = [
  { key: DEEPCHECK_NLI_KEY, name: 'Contradiction scan', detail: 'NLI cross-check of new chapters vs canon · ~250MB on first use' },
  { key: DEEPCHECK_LANG_KEY, name: 'Language watch', detail: 'flags prose in the wrong language · downloads weights on first use' },
  { key: SUMMARIZER_KEY, name: 'Ledger compression', detail: 'compresses planning history past 8k chars · ~300MB on first use' },
  { key: DEEPCHECK_GENRE_KEY, name: 'Genre check', detail: 'outline vs contracted genre, once per book · ~400MB on first use' },
  { key: DEEPCHECK_EMOTION_KEY, name: 'Emotion scoring', detail: 'dominant emotion and arc travel per chapter · ~130MB on first use' },
];

/** Anything but an explicit 'off' leaves the cross-encoder on, which is the behaviour it had. */
function rerankerOn(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(RERANK_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function setRerankerOn(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.removeItem(RERANK_STORAGE_KEY);
    else localStorage.setItem(RERANK_STORAGE_KEY, 'off');
  } catch { /* a browser that refuses storage keeps the default */ }
}

export default function LocalModelToggles() {
  const [flags, setFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MODELS.map(model => [model.key, isLocalModelOn(model.key)])),
  );
  const [reranker, setReranker] = useState(rerankerOn);

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800">
      <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">Local models (opt-in)</div>
      <div className="flex flex-col gap-2">
        {MODELS.map(model => (
          <label key={model.key} className="flex items-start gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(flags[model.key])}
              onChange={event => {
                setLocalModel(model.key, event.target.checked);
                setFlags(previous => ({ ...previous, [model.key]: event.target.checked }));
              }}
              className="mt-0.5 accent-zinc-400"
            />
            <span>
              <span className="text-zinc-200">{model.name}</span>
              <span className="text-zinc-500"> — {model.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-zinc-800">
        <label className="flex items-start gap-2 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={reranker}
            onChange={event => { setRerankerOn(event.target.checked); setReranker(event.target.checked); }}
            className="mt-0.5 accent-zinc-400"
          />
          <span>
            <span className="text-zinc-200">Repetition cross-encoder</span>
            <span className="text-zinc-500"> — on by default, and the heaviest: ~600MB resident and about a second of CPU per pair, some forty pairs a chapter. Turn it off if the tab stops answering; the cosine then decides alone, as it did before this model existed.</span>
          </span>
        </label>
      </div>
    </div>
  );
}
