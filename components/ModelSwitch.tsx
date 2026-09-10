import React, { useEffect, useState } from 'react';
import { Select } from './common/Select';
import { getStoredProviderConfig, getStoredValidatorConfig, saveStoredProviderConfig, saveStoredValidatorConfig } from '../services/llmService';
import { fetchOllamaModels } from '../services/ollamaService';

/**
 * Offered where a run has stopped. A stuck chapter is often one model's own habit — endings it
 * repeats, contracts it will not obey — and the next attempt reads whichever models are stored,
 * so changing one here applies to the manuscript already in progress.
 */
export default function ModelSwitch() {
  const [writer, setWriter] = useState(() => getStoredProviderConfig());
  const [validator, setValidator] = useState(() => getStoredValidatorConfig());
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    if (writer.provider !== 'ollama' && validator?.provider !== 'ollama') return;
    let live = true;
    fetchOllamaModels(writer.ollamaEndpoint).then(list => { if (live) setModels(list); }).catch(() => {});
    return () => { live = false; };
  }, [writer.provider, writer.ollamaEndpoint, validator?.provider]);

  const options = models.length ? models : [writer.ollamaModel, validator?.ollamaModel].filter(Boolean) as string[];

  return (
    <div className="mt-3 pt-3 border-t border-red-900/40 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label htmlFor="switchWriter" className="block text-xs font-semibold uppercase text-zinc-500 mb-1">Writer</label>
        <Select id="switchWriter" value={writer.ollamaModel} disabled={writer.provider !== 'ollama'}
          onChange={event => { const next = { ...writer, ollamaModel: event.target.value }; setWriter(next); saveStoredProviderConfig(next); }}>
          {options.map(model => <option key={model} value={model}>{model}</option>)}
        </Select>
      </div>
      <div>
        <label htmlFor="switchEditor" className="block text-xs font-semibold uppercase text-zinc-500 mb-1">Editor</label>
        <Select id="switchEditor" value={validator?.ollamaModel || writer.ollamaModel} disabled={!validator}
          onChange={event => {
            if (!validator) return;
            const next = { ...validator, ollamaModel: event.target.value, enabled: true };
            setValidator(next); saveStoredValidatorConfig(next);
          }}>
          {options.map(model => <option key={model} value={model}>{model}</option>)}
        </Select>
      </div>
    </div>
  );
}
