import React, { useState, useEffect } from 'react';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';
import { Input } from './common/Input';
import { Combo } from './common/Combo';
import { GEMINI_MODEL_NAME, MIN_CHAPTERS } from '../constants';
import { GENRE_CHOICES } from '../utils/genreList';
import { fetchHuggingFaceModels } from '../services/hfBrowserService';
import { getStoredProviderConfig, getStoredValidatorConfig, getStoredSecondWriterConfig, saveStoredProviderConfig, saveStoredValidatorConfig, saveStoredSecondWriterConfig } from '../services/llmService';
import { fetchOllamaModels } from '../services/ollamaService';
import { fetchProviderModels } from '../services/qwenBrowserService';
import { LLMProviderConfig, StorySettings } from '../types';

interface UserInputProps {
  bookTitle?: string;
  setBookTitle?: (value: string) => void;
  storyPremise: string;
  setStoryPremise: (value: string) => void;
  numChapters: number;
  setNumChapters: (value: number) => void;
  genre: string;
  setGenre: (value: string) => void;
  storySettings: StorySettings;
  setStorySettings: (settings: StorySettings) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

const UserInput: React.FC<UserInputProps> = ({
  bookTitle,
  setBookTitle,
  storyPremise,
  setStoryPremise,
  numChapters,
  setNumChapters,
  genre,
  setGenre,
  storySettings,
  setStorySettings,
  onSubmit,
  isLoading,
}) => {
  const [providerConfig, setProviderConfig] = useState<LLMProviderConfig>(() => getStoredProviderConfig());
  const [validator, setValidator] = useState<LLMProviderConfig & { enabled: boolean }>(() => {
    const stored = getStoredValidatorConfig();
    return { ...(stored || getStoredProviderConfig()), enabled: Boolean(stored) };
  });

  const [secondWriter, setSecondWriter] = useState<LLMProviderConfig & { enabled: boolean }>(() => {
    const stored = getStoredSecondWriterConfig();
    return { ...(stored || getStoredProviderConfig()), enabled: Boolean(stored) };
  });
  const updateSecondWriter = (change: Partial<LLMProviderConfig & { enabled: boolean }>) => {
    const next = { ...secondWriter, ...change };
    setSecondWriter(next);
    saveStoredSecondWriterConfig(next.enabled ? next : undefined);
  };
  const fieldId = (label: string) => `model-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  // Hugging Face Inference Providers: the router's public list, as suggestions for the model field.
  const [hfModels, setHfModels] = useState<{ id: string; providers: string[] }[]>([]);
  const [hfNote, setHfNote] = useState('');
  const loadHfModels = () => { setHfNote('Loading…'); fetchHuggingFaceModels().then(models => { setHfModels(models); setHfNote(`${models.length} models on the router`); }, error => setHfNote(error instanceof Error ? error.message : 'Model list failed')); };
  const hfField = (label: string, value: string | undefined, onChange: (model: string) => void) => (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <label className="block text-xs font-medium text-zinc-300">{label}</label>
        <button type="button" onClick={loadHfModels} className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors">List models</button>
      </div>
      <Combo id={fieldId(label)} value={value || ''} onChange={model => onChange(model.trim())} placeholder="org/model or org/model:provider" className="text-xs font-mono" options={hfModels.map(model => ({ value: model.id, label: model.providers.join(', ') }))} />
      <p className="text-xs text-zinc-500">
        Hugging Face routes the request to a provider that serves the model; add <span className="font-mono">:provider</span>, <span className="font-mono">:fastest</span> or <span className="font-mono">:cheapest</span> to choose. Uses HF_TOKEN from .env.local.{hfNote ? ` ${hfNote}.` : ''}
        {value && hfModels.find(m => m.id === value.split(':')[0]) ? ` Served by: ${hfModels.find(m => m.id === value.split(':')[0])!.providers.join(', ')}.` : ''}
      </p>
    </div>
  );
  const updateValidator = (change: Partial<LLMProviderConfig & { enabled: boolean }>) => {
    const next = { ...validator, ...change };
    setValidator(next);
    saveStoredValidatorConfig(next.enabled ? next : undefined);
  };
  const [compatibleUrl, setCompatibleUrl] = useState('');
  const [compatibleDirty, setCompatibleDirty] = useState(false);
  const [compatibleNote, setCompatibleNote] = useState('');
  useEffect(() => {
    if (providerConfig.provider !== 'compatible' && (!validator.enabled || validator.provider !== 'compatible')) return;
    let active = true;
    fetch('/api/keys').then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load API settings');
      if (active && !compatibleDirty) setCompatibleUrl(current => current || data.keys?.COMPATIBLE_BASE_URL?.value || '');
    }).catch(error => { if (active) setCompatibleNote(error instanceof Error ? error.message : 'Could not load API settings'); });
    return () => { active = false; };
  }, [providerConfig.provider, validator.enabled, validator.provider]);
  const saveCompatibleUrl = async (): Promise<boolean> => {
    if (!compatibleDirty) return true;
    try {
      const url = new URL(compatibleUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Enter an HTTP(S) base URL without credentials, query or fragment.');
      setCompatibleNote('Saving…');
      const response = await fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'COMPATIBLE_BASE_URL', value: compatibleUrl.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save base URL');
      setCompatibleDirty(false); setCompatibleNote('Saved'); return true;
    } catch (error) { setCompatibleNote(error instanceof Error ? error.message : 'Could not save base URL'); return false; }
  };
  const compatibleEndpointField = (prefix: string) => <div className="space-y-1.5">
    <label htmlFor={`${prefix}-api-base-url`} className="block text-xs font-medium text-zinc-300">Base URL</label>
    <Input id={`${prefix}-api-base-url`} value={compatibleUrl} onChange={e => { setCompatibleUrl(e.target.value); setCompatibleDirty(true); setCompatibleNote('Unsaved'); }} placeholder="http://127.0.0.1:8085/v1/" className="font-mono" />
    <div className="flex items-center justify-between gap-2"><p className="text-xs text-zinc-500">Include /v1 if required. Shared by author and reader. {compatibleNote}</p><button type="button" onClick={() => { void saveCompatibleUrl(); }} className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors">Save URL</button></div>
  </div>;
  // Gemini, Qwen and Anthropic: the models their own servers report, as suggestions for the same kind of field.
  const [listed, setListed] = useState<{ gemini: string[]; qwen: string[]; anthropic: string[]; compatible: string[] }>({ gemini: [], qwen: [], anthropic: [], compatible: [] });
  const [listNote, setListNote] = useState<{ gemini: string; qwen: string; anthropic: string; compatible: string }>({ gemini: '', qwen: '', anthropic: '', compatible: '' });
  const loadListed = async (provider: 'gemini' | 'qwen' | 'anthropic' | 'compatible') => { if (provider === 'compatible' && !await saveCompatibleUrl()) return; setListNote(note => ({ ...note, [provider]: 'Loading…' })); fetchProviderModels(provider).then(models => { setListed(all => ({ ...all, [provider]: models })); setListNote(note => ({ ...note, [provider]: `${models.length} models from ${provider === 'gemini' ? 'Gemini' : provider === 'qwen' ? 'Qwen' : provider === 'compatible' ? 'Compatible API' : 'Anthropic'}` })); }, error => setListNote(note => ({ ...note, [provider]: error instanceof Error ? error.message : 'Model list failed' }))); };
  const listedField = (provider: 'gemini' | 'qwen' | 'anthropic' | 'compatible', label: string, value: string | undefined, onChange: (model: string) => void, placeholder: string, hint: string) => (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <label className="block text-xs font-medium text-zinc-300">{label}</label>
        <button type="button" onClick={() => loadListed(provider)} className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors">List models</button>
      </div>
      <Combo id={fieldId(label)} value={value || ''} onChange={model => onChange(model.trim())} placeholder={placeholder} className="text-xs font-mono" options={listed[provider].map(model => ({ value: model }))} />
      <p className="text-xs text-zinc-500">{hint}{listNote[provider] ? ` ${listNote[provider]}.` : ''}</p>
    </div>
  );
  // Ollama: the models it reports, as suggestions for the model field — the same field as Hugging Face's.
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaNote, setOllamaNote] = useState('');
  const loadOllamaModels = () => { setOllamaNote('Loading…'); fetchOllamaModels(providerConfig.ollamaEndpoint).then(models => { setOllamaModels(models); setOllamaNote(models.length ? `${models.length} models in Ollama` : 'Ollama is reachable, but its model list is empty'); }, error => setOllamaNote(error instanceof Error ? error.message : 'Cannot connect to Ollama')); };
  const ollamaField = (label: string, value: string | undefined, onChange: (model: string) => void, hint: string) => (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <label className="block text-xs font-medium text-zinc-300">{label}</label>
        <button type="button" onClick={loadOllamaModels} className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors">List models</button>
      </div>
      <Combo id={fieldId(label)} value={value || ''} onChange={model => onChange(model.trim())} placeholder="llama3.1 or name:cloud" className="text-xs font-mono" options={ollamaModels.map(model => ({ value: model }))} />
      <p className="text-xs text-zinc-500">{hint}{ollamaNote ? ` ${ollamaNote}.` : ''}</p>
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((providerConfig.provider === 'compatible' || (validator.enabled && validator.provider === 'compatible')) && !await saveCompatibleUrl()) return;
    if (numChapters >= MIN_CHAPTERS) {
      onSubmit();
    } else {
      alert(`Please enter at least ${MIN_CHAPTERS} chapters.`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* AI Model Provider Section */}
      <div className="border border-zinc-800 rounded bg-zinc-900/40 p-4 md:p-5 space-y-4">
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-200 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" aria-hidden="true" />
              <span>Author model</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">The model that writes the book: keeps the notebook, plans, speaks as its characters and writes every chapter.</p>
          </div>
          
          <div className="inline-flex flex-wrap items-center rounded bg-zinc-950 p-1 border border-zinc-800 gap-1" role="tablist" aria-label="Author provider selection">
            <button
              type="button"
              onClick={() => {
                const updated = { ...providerConfig, provider: 'gemini' as const };
                setProviderConfig(updated);
                saveStoredProviderConfig(updated);
              }}
              className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                providerConfig.provider === 'gemini'
                  ? 'bg-zinc-200 text-zinc-900 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              Gemini
            </button>
            <button
              type="button"
              onClick={() => {
                const updated = { ...providerConfig, provider: 'ollama' as const };
                setProviderConfig(updated);
                saveStoredProviderConfig(updated);
              }}
              className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                providerConfig.provider === 'ollama'
                  ? 'bg-zinc-200 text-zinc-900 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              Ollama
            </button>
            <button type="button" onClick={()=>{const updated={...providerConfig,provider:'qwen' as const};setProviderConfig(updated);saveStoredProviderConfig(updated)}} className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${providerConfig.provider==='qwen'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>Qwen</button>
            <button type="button" onClick={()=>{const updated={...providerConfig,provider:'huggingface' as const};setProviderConfig(updated);saveStoredProviderConfig(updated)}} className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${providerConfig.provider==='huggingface'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>Hugging Face</button>
            <button type="button" onClick={()=>{const updated={...providerConfig,provider:'anthropic' as const};setProviderConfig(updated);saveStoredProviderConfig(updated)}} className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${providerConfig.provider==='anthropic'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>Anthropic</button>
            <button type="button" onClick={()=>{const updated={...providerConfig,provider:'compatible' as const};setProviderConfig(updated);saveStoredProviderConfig(updated)}} className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${providerConfig.provider==='compatible'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>API compatible</button>
          </div>
        </div>
        {providerConfig.provider==='compatible' && <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3">{compatibleEndpointField('author')}{listedField('compatible', 'API model', providerConfig.compatibleModel, model => { const updated = { ...providerConfig, compatibleModel: model }; setProviderConfig(updated); saveStoredProviderConfig(updated); }, 'model-id', 'OpenAI-compatible Chat Completions. Optional key stays in API settings.')}</div>}
        {providerConfig.provider==='anthropic' && <div className="mt-4 pt-3 border-t border-zinc-800">{listedField('anthropic', 'Anthropic model', providerConfig.anthropicModel, model => { const updated = { ...providerConfig, anthropicModel: model || undefined }; setProviderConfig(updated); saveStoredProviderConfig(updated); }, 'claude-opus-5-5', 'Uses ANTHROPIC_API_KEY from .env.local. Empty means claude-opus-5-5.')}</div>}
        {providerConfig.provider==='huggingface' && <div className="mt-4 pt-3 border-t border-zinc-800">{hfField('Hugging Face model', providerConfig.hfModel, model => {const updated={...providerConfig,hfModel:model||undefined};setProviderConfig(updated);saveStoredProviderConfig(updated);})}</div>}

        {providerConfig.provider==='qwen' && <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3">{listedField('qwen', 'Qwen model', providerConfig.qwenModel, model => { const updated = { ...providerConfig, qwenModel: model || undefined }; setProviderConfig(updated); saveStoredProviderConfig(updated); }, 'qwen3.8-flash', 'Uses the server API key and endpoint from .env.local. Thinking is off. Empty means qwen3.8-flash.')}</div>}
        {/* Gemini Details */}
        {providerConfig.provider === 'gemini' && (
          <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3 animate-fade-in">
            {listedField('gemini', 'Gemini model', providerConfig.geminiModel, model => { const updated = { ...providerConfig }; if (model) updated.geminiModel = model; else delete updated.geminiModel; setProviderConfig(updated); saveStoredProviderConfig(updated); }, GEMINI_MODEL_NAME, `Any Gemini model ID. Empty means the default (${GEMINI_MODEL_NAME}).`)}
          </div>
        )}

        {/* Ollama Details */}
        {providerConfig.provider === 'ollama' && (
          <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Ollama Endpoint / Proxy
                </label>
                <Input
                  type="text"
                  value={providerConfig.ollamaEndpoint}
                  onChange={(e) => {
                    const updated = { ...providerConfig, ollamaEndpoint: e.target.value };
                    setProviderConfig(updated);
                    saveStoredProviderConfig(updated);
                    if (validator.enabled && validator.provider === 'ollama') {
                      updateValidator({ ollamaEndpoint: e.target.value });
                    }
                  }}
                  placeholder="/api/ollama"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Default /api/ollama (proxied via Vite without CORS)
                </p>
              </div>

              {ollamaField('Ollama model', providerConfig.ollamaModel, model => { const updated = { ...providerConfig, ollamaModel: model }; setProviderConfig(updated); saveStoredProviderConfig(updated); }, 'Any model your Ollama serves, local or cloud.')}
            </div>
          </div>
        )}

        {/* Editor (critic) model */}
        <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={validator.enabled}
              onChange={(e) => updateValidator(e.target.checked
                ? { enabled: true, ollamaEndpoint: providerConfig.ollamaEndpoint }
                : { enabled: false })}
              className="accent-zinc-200"
            />
            <span>Reader model</span>
          </label>
          <p className="text-xs text-zinc-400">
            Another model that reads what the author writes: checks each chapter and audits promises and character arcs before the ending. Off means the author model judges its own text.
          </p>

          {validator.enabled && (
            <div className="space-y-3 animate-fade-in pt-1">
              <div className="inline-flex flex-wrap items-center rounded bg-zinc-950 p-1 border border-zinc-800 gap-1" role="tablist" aria-label="Reader provider selection">
                <button
                  type="button"
                  onClick={() => updateValidator({ provider: 'gemini' })}
                  className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    validator.provider === 'gemini'
                      ? 'bg-zinc-200 text-zinc-900 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  Gemini
                </button>
                <button
                  type="button"
                  onClick={() => updateValidator({ provider: 'ollama' })}
                  className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    validator.provider === 'ollama'
                      ? 'bg-zinc-200 text-zinc-900 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  Ollama
                </button>
                <button type="button" onClick={()=>updateValidator({provider:'qwen'})} className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${validator.provider==='qwen'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>Qwen</button>
                <button type="button" onClick={()=>updateValidator({provider:'huggingface'})} className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${validator.provider==='huggingface'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>Hugging Face</button>
                <button type="button" onClick={()=>updateValidator({provider:'anthropic'})} className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${validator.provider==='anthropic'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>Anthropic</button>
                <button type="button" onClick={()=>updateValidator({provider:'compatible'})} className={`h-7 px-2.5 py-1 rounded text-xs font-medium transition-colors ${validator.provider==='compatible'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>API compatible</button>
              </div>

              {validator.provider === 'compatible' ? <div className="space-y-3">{compatibleEndpointField('reader')}{listedField('compatible', 'Reader API model', validator.compatibleModel, model => updateValidator({ compatibleModel: model }), 'model-id', 'Optional key stays in API settings.')}</div> : validator.provider === 'anthropic' ? listedField('anthropic', 'Reader Anthropic model', validator.anthropicModel, model => updateValidator({ anthropicModel: model || undefined }), 'claude-opus-5-5', 'Uses ANTHROPIC_API_KEY from .env.local. Empty means claude-opus-5-5.') : validator.provider === 'huggingface' ? hfField('Reader Hugging Face model', validator.hfModel, model => updateValidator({ hfModel: model || undefined })) : validator.provider === 'qwen' ? listedField('qwen', 'Reader Qwen model', validator.qwenModel, model => updateValidator({ qwenModel: model || undefined }), 'qwen3.8-flash', 'Empty means qwen3.8-flash.') : validator.provider === 'gemini' ? (
                listedField('gemini', 'Reader Gemini model', validator.geminiModel, model => updateValidator({ geminiModel: model || undefined }), GEMINI_MODEL_NAME, `Pick a different model than the author. Empty means the default (${GEMINI_MODEL_NAME}).`)
              ) : (
                ollamaField('Reader Ollama model', validator.ollamaModel, model => updateValidator({ ollamaModel: model }), 'Uses the same Ollama endpoint as the author.')
              )}
            </div>
          )}
        </div>

      </div>

      <div>
        <label htmlFor="bookTitle" className="block text-sm font-medium text-zinc-200 mb-1.5">
          Book title <span className="text-zinc-500 font-normal text-xs">(optional)</span>
        </label>
        <Input
          id="bookTitle"
          type="text"
          value={bookTitle || ''}
          onChange={(e) => setBookTitle?.(e.target.value)}
          placeholder="Leave blank to let the AI author invent an evocative commercial title..."
          maxLength={100}
        />
        <p className="text-xs text-zinc-500 mt-1">If blank, the author model will invent an original commercial title during planning.</p>
      </div>

      <div>
        <label htmlFor="storyPremise" className="block text-sm font-medium text-zinc-200 mb-1.5">
          Story premise
        </label>
        <TextArea
          id="storyPremise"
          value={storyPremise}
          onChange={(e) => setStoryPremise(e.target.value)}
          placeholder="Describe your story idea (core conflict, protagonist goals, setting)..."
          rows={5}
          required
          maxLength={1200} 
        />
        <p className="text-xs text-zinc-500 mt-1">Maximum 1200 characters.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="genre" className="block text-sm font-medium text-zinc-200 mb-1.5">
            Genre
          </label>
          <Combo id="genre" value={genre} onChange={setGenre} placeholder="thriller" className="text-xs font-mono"
            options={GENRE_CHOICES} />
          <p className="text-xs text-zinc-500 mt-1">Pick one, type to search, or name your own.</p>
        </div>

        <div>
          <label htmlFor="numChapters" className="block text-sm font-medium text-zinc-200 mb-1.5">
            Number of chapters
          </label>
          <Input
            id="numChapters"
            type="number"
            value={numChapters}
            onChange={(e) => setNumChapters(Math.max(MIN_CHAPTERS, parseInt(e.target.value, 10) || MIN_CHAPTERS))}
            min={MIN_CHAPTERS}
            max={100}
            required
          />
           <p className="text-xs text-zinc-500 mt-1">{MIN_CHAPTERS}–100 chapters</p>
        </div>

        <div>
          <label htmlFor="targetWordsPerChapter" className="block text-sm font-medium text-zinc-200 mb-1.5">
            Words per chapter
          </label>
          <Input
            id="targetWordsPerChapter"
            type="number"
            value={storySettings.targetWordsPerChapter ?? 2000}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setStorySettings({
                ...storySettings,
                targetWordsPerChapter: isNaN(val) ? 2000 : Math.max(300, val),
              });
            }}
            step={250}
            min={300}
            max={20000}
            required
          />
          <p className="text-xs text-zinc-500 mt-1">
            ~{((storySettings.targetWordsPerChapter ?? 2000) * numChapters).toLocaleString()} total words
          </p>
        </div>
      </div>

      <div className="pt-1">
        <p className="text-xs text-zinc-400/90 leading-relaxed pl-3 border-l-2 border-zinc-800">
          Craft 2.0 Engine: Two-layer architecture (Author Dossier with 4 truth layers + Scene Projection Cards), blind scene-by-scene writing with an anti-metaphor barrier, continuous observer verification, and dual developmental/literary audits.
        </p>
      </div>

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={isLoading || !storyPremise || numChapters < MIN_CHAPTERS} variant="primary">
          {isLoading ? 'Starting…' : 'Start Generation'}
        </Button>
      </div>

      <div className="mt-10 pt-8 border-t border-zinc-800 space-y-4 text-zinc-300">
        <div>
          <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            Storytelling Craft 2.0 Architecture
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="p-3.5 rounded border border-zinc-800/80 bg-zinc-900/30 space-y-1.5">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">01. Author Dossier & 4 Layers of Truth</h3>
            <p className="text-xs text-zinc-400/90 leading-relaxed">
              Setting, backstory, character psychology, and hidden motives are architected before prose drafting. The engine maintains four unbreakable truth layers: objective world facts, character secrets, current POV boundaries, and public facades.
            </p>
          </div>

          <div className="p-3.5 rounded border border-zinc-800/80 bg-zinc-900/30 space-y-1.5">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">02. Scene Cards & Projection Matrix</h3>
            <p className="text-xs text-zinc-400/90 leading-relaxed">
              Each scene is budgeted with explicit goals, knowledge boundaries, value charge shifts, and concrete props. The writer only accesses facts the POV character knows at that exact second, preventing unearned omniscience.
            </p>
          </div>

          <div className="p-3.5 rounded border border-zinc-800/80 bg-zinc-900/30 space-y-1.5">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">03. Grounded Prose & Anti-Metaphor Rule</h3>
            <p className="text-xs text-zinc-400/90 leading-relaxed">
              Scenes are executed through tangible physical action, oblique dialogue, and sensory reality. Stock clichés, cosmic abstractions, and reflective filler are banned—dramatic conflict is enacted directly on the page.
            </p>
          </div>

          <div className="p-3.5 rounded border border-zinc-800/80 bg-zinc-900/30 space-y-1.5">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">04. Observer, Blind Reader & Dual Audit</h3>
            <p className="text-xs text-zinc-400/90 leading-relaxed">
              An external observer verifies action enactment and issues scene receipts. A blind reader tracks hypotheses across chapter prefixes, and a final dual audit validates causal closure, character arcs, and literary style.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};

export default UserInput;
