import {WritingStyleFields} from './WritingStyleFields';
import React, { useState, useEffect } from 'react';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';
import { Input } from './common/Input';
import { Combo } from './common/Combo';
import { GEMINI_MODEL_NAME, MIN_CHAPTERS, MAX_CHAPTERS } from '../constants';
import { GENRE_CHOICES } from '../utils/genreList';
import { getStoredProviderConfig, getStoredValidatorConfig, getStoredSecondWriterConfig, saveStoredProviderConfig, saveStoredValidatorConfig, saveStoredSecondWriterConfig } from '../services/llmService';
import { fetchHuggingFaceModels } from '../services/hfBrowserService';
import { fetchOllamaModels } from '../services/ollamaService';
import { fetchProviderModels } from '../services/providerModelsService';
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
  planningOnly?: boolean;
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
  planningOnly = false,
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
  // Gemini and Anthropic: the models their own servers report, as suggestions for the same kind of field.
  const [listed, setListed] = useState<{ gemini: string[]; anthropic: string[]; compatible: string[] }>({ gemini: [], anthropic: [], compatible: [] });
  const [listNote, setListNote] = useState<{ gemini: string; anthropic: string; compatible: string }>({ gemini: '', anthropic: '', compatible: '' });
  const loadListed = async (provider: 'gemini' | 'anthropic' | 'compatible') => { if (provider === 'compatible' && !await saveCompatibleUrl()) return; setListNote(note => ({ ...note, [provider]: 'Loading…' })); fetchProviderModels(provider).then(models => { setListed(all => ({ ...all, [provider]: models })); setListNote(note => ({ ...note, [provider]: `${models.length} models from ${provider === 'gemini' ? 'Gemini' : provider === 'compatible' ? 'Compatible API' : 'Anthropic'}` })); }, error => setListNote(note => ({ ...note, [provider]: error instanceof Error ? error.message : 'Model list failed' }))); };
  const listedField = (provider: 'gemini' | 'anthropic' | 'compatible', label: string, value: string | undefined, onChange: (model: string) => void, placeholder: string, hint: string) => (
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
    if ((providerConfig.provider === 'compatible' || (!planningOnly && validator.enabled && validator.provider === 'compatible')) && !await saveCompatibleUrl()) return;
    if (numChapters >= MIN_CHAPTERS && numChapters <= MAX_CHAPTERS) {
      onSubmit();
    } else {
      alert(`Please enter between ${MIN_CHAPTERS} and ${MAX_CHAPTERS} chapters.`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* AI Model Provider Section */}
      <div className="border border-zinc-800 rounded bg-zinc-900/40 text-left">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
          <h2 className="text-sm font-medium text-zinc-200">AI Models</h2>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          <div className="space-y-2">
            <div>
              <h3 className="text-xs font-medium text-zinc-300">Author model</h3>
              <p className="text-xs text-zinc-500 mt-0.5">The model that writes the book: keeps the notebook, plans, speaks as its characters and writes every chapter.</p>
            </div>
            
            <div className="inline-flex flex-wrap items-center rounded bg-zinc-950 p-1 border border-zinc-800 gap-1" role="tablist" aria-label="Author provider selection">
              <button
                type="button"
                onClick={() => {
                  const updated = { ...providerConfig, provider: 'gemini' as const };
                  setProviderConfig(updated);
                  saveStoredProviderConfig(updated);
                }}
                className={`h-6 px-2.5 text-xs font-medium rounded transition-colors ${
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
                className={`h-6 px-2.5 text-xs font-medium rounded transition-colors ${
                  providerConfig.provider === 'ollama'
                    ? 'bg-zinc-200 text-zinc-900 font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                Ollama
              </button>
              <button type="button" onClick={()=>{const updated={...providerConfig,provider:'huggingface' as const};setProviderConfig(updated);saveStoredProviderConfig(updated)}} className={`h-6 px-2.5 text-xs font-medium rounded transition-colors ${providerConfig.provider==='huggingface'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>Hugging Face</button>
              <button type="button" onClick={()=>{const updated={...providerConfig,provider:'anthropic' as const};setProviderConfig(updated);saveStoredProviderConfig(updated)}} className={`h-6 px-2.5 text-xs font-medium rounded transition-colors ${providerConfig.provider==='anthropic'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>Anthropic</button>
              <button type="button" onClick={()=>{const updated={...providerConfig,provider:'compatible' as const};setProviderConfig(updated);saveStoredProviderConfig(updated)}} className={`h-6 px-2.5 text-xs font-medium rounded transition-colors ${providerConfig.provider==='compatible'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>API compatible</button>
            </div>
          </div>

          {providerConfig.provider==='compatible' && <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3">{compatibleEndpointField('author')}{listedField('compatible', 'API model', providerConfig.compatibleModel, model => { const updated = { ...providerConfig, compatibleModel: model }; setProviderConfig(updated); saveStoredProviderConfig(updated); }, 'model-id', 'OpenAI-compatible Chat Completions. Optional key stays in API settings.')}</div>}
          {providerConfig.provider==='anthropic' && <div className="mt-4 pt-3 border-t border-zinc-800">{listedField('anthropic', 'Anthropic model', providerConfig.anthropicModel, model => { const updated = { ...providerConfig, anthropicModel: model || undefined }; setProviderConfig(updated); saveStoredProviderConfig(updated); }, 'claude-opus-5-5', 'Uses ANTHROPIC_API_KEY from .env.local. Empty means claude-opus-5-5.')}</div>}
          {providerConfig.provider==='huggingface' && <div className="mt-4 pt-3 border-t border-zinc-800">{hfField('Hugging Face model', providerConfig.hfModel, model => {const updated={...providerConfig,hfModel:model||undefined};setProviderConfig(updated);saveStoredProviderConfig(updated);})}</div>}
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
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Default /api/ollama (proxied via Vite without CORS)
                  </p>
                </div>

                {ollamaField('Ollama model', providerConfig.ollamaModel, model => { const updated = { ...providerConfig, ollamaModel: model }; setProviderConfig(updated); saveStoredProviderConfig(updated); }, 'Any model your Ollama serves, local or cloud.')}
              </div>
            </div>
          )}

          {/* Reader settings belong to the legacy prose workflow. */}
          {!planningOnly && <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-200 cursor-pointer select-none">
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
            <p className="text-xs text-zinc-500">
              Another model that reads what the author writes: checks each chapter and audits promises and character arcs before the ending. Off means the author model judges its own text.
            </p>

            {validator.enabled && (
              <div className="space-y-3 animate-fade-in pt-1">
                <div className="inline-flex flex-wrap items-center rounded bg-zinc-950 p-1 border border-zinc-800 gap-1" role="tablist" aria-label="Reader provider selection">
                  <button
                    type="button"
                    onClick={() => updateValidator({ provider: 'gemini' })}
                    className={`h-6 px-2.5 text-xs font-medium rounded transition-colors ${
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
                    className={`h-6 px-2.5 text-xs font-medium rounded transition-colors ${
                      validator.provider === 'ollama'
                        ? 'bg-zinc-200 text-zinc-900 font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    Ollama
                  </button>
                  <button type="button" onClick={()=>updateValidator({provider:'huggingface'})} className={`h-6 px-2.5 text-xs font-medium rounded transition-colors ${validator.provider==='huggingface'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>Hugging Face</button>
                  <button type="button" onClick={()=>updateValidator({provider:'anthropic'})} className={`h-6 px-2.5 text-xs font-medium rounded transition-colors ${validator.provider==='anthropic'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>Anthropic</button>
                  <button type="button" onClick={()=>updateValidator({provider:'compatible'})} className={`h-6 px-2.5 text-xs font-medium rounded transition-colors ${validator.provider==='compatible'?'bg-zinc-200 text-zinc-900 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}>API compatible</button>
                </div>

                {validator.provider === 'compatible' ? <div className="space-y-3">{compatibleEndpointField('reader')}{listedField('compatible', 'Reader API model', validator.compatibleModel, model => updateValidator({ compatibleModel: model }), 'model-id', 'Optional key stays in API settings.')}</div> : validator.provider === 'anthropic' ? listedField('anthropic', 'Reader Anthropic model', validator.anthropicModel, model => updateValidator({ anthropicModel: model || undefined }), 'claude-opus-5-5', 'Uses ANTHROPIC_API_KEY from .env.local. Empty means claude-opus-5-5.') : validator.provider === 'huggingface' ? hfField('Reader Hugging Face model', validator.hfModel, model => updateValidator({ hfModel: model || undefined })) : validator.provider === 'gemini' ? (
                  listedField('gemini', 'Reader Gemini model', validator.geminiModel, model => updateValidator({ geminiModel: model || undefined }), GEMINI_MODEL_NAME, `Pick a different model than the author. Empty means the default (${GEMINI_MODEL_NAME}).`)
                ) : (
                  ollamaField('Reader Ollama model', validator.ollamaModel, model => updateValidator({ ollamaModel: model }), 'Uses the same Ollama endpoint as the author.')
                )}
              </div>
            )}
          </div>}
        </div>
      </div>

      {/* Story Setup Section */}
      <div className="border border-zinc-800 rounded bg-zinc-900/40 text-left">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
          <h2 className="text-sm font-medium text-zinc-200">Story Setup</h2>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          {setBookTitle && <div><label htmlFor="bookTitle" className="block text-xs font-medium text-zinc-300 mb-1.5">Book title (optional)</label><Input id="bookTitle" value={bookTitle || ''} onChange={e=>setBookTitle(e.target.value)} placeholder="Leave blank to let the model suggest a title" /></div>}
          <div>
            <label htmlFor="storyPremise" className="block text-xs font-medium text-zinc-300 mb-1.5">
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
            <p className="text-[11px] text-zinc-500 mt-1">Maximum 1200 characters.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="genre" className="block text-xs font-medium text-zinc-300 mb-1.5">
                Genre
              </label>
              <Combo id="genre" value={genre} onChange={setGenre} placeholder="thriller" className="text-xs font-mono"
                options={GENRE_CHOICES} />
              <p className="text-[11px] text-zinc-500 mt-1">Pick one, type to search, or name your own.</p>
            </div>

            <div>
              <label htmlFor="numChapters" className="block text-xs font-medium text-zinc-300 mb-1.5">
                Number of chapters
              </label>
              <Input
                id="numChapters"
                type="number"
                value={numChapters}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (isNaN(val)) {
                    setNumChapters(MIN_CHAPTERS);
                  } else {
                    setNumChapters(Math.min(MAX_CHAPTERS, Math.max(MIN_CHAPTERS, val)));
                  }
                }}
                min={MIN_CHAPTERS}
                max={MAX_CHAPTERS}
                required
              />
              <p className="text-[11px] text-zinc-500 mt-1">{MIN_CHAPTERS}–{MAX_CHAPTERS} chapters</p>
            </div>

            <div>
              <label htmlFor="targetWordsPerChapter" className="block text-xs font-medium text-zinc-300 mb-1.5">
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
                step={1}
                min={300}
                max={20000}
                required
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                ~{((storySettings.targetWordsPerChapter ?? 2000) * numChapters).toLocaleString()} total words
              </p>
            </div>
            {/* Narrative Perspective & Grammatical Tense */}
              <div>
                <label htmlFor="narrativeVoice" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Point of view (POV)
                </label>
                <Combo id="narrativeVoice" selectionOnly value={storySettings.narrativeVoice || 'third-limited'}
                  onChange={narrativeVoice=>setStorySettings({...storySettings,narrativeVoice})} className="text-xs font-mono"
                  options={[{value:'third-limited',label:'Third Person Limited (Recommended)'},{value:'first-person',label:'First Person'},{value:'third-omniscient',label:'Third Person Omniscient'}]} />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Anchored inside viewpoint character senses and immediate consciousness.
                </p>
              </div>

              <div>
                <label htmlFor="tense" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Grammatical tense
                </label>
                <Combo id="tense" selectionOnly value={storySettings.tense || 'past'}
                  onChange={tense=>setStorySettings({...storySettings,tense})} className="text-xs font-mono"
                  options={[{value:'past',label:'Past Tense (Standard)'},{value:'present',label:'Present Tense'}]} />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Standard fiction past tense narration.
                </p>
              </div>
          </div>
        </div>
      </div>

      {planningOnly&&<section aria-label="Writing style" className="border border-zinc-800 rounded bg-zinc-900/40 text-left"><div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80"><h2 className="text-sm font-medium text-zinc-200">Writing style <span className="text-zinc-500">(optional)</span></h2></div><div className="p-4 md:p-5 space-y-3"><p className="text-xs text-zinc-400">Add preferences, prose examples, or both. A shared, editable style profile will be created once before the book outline. You can also enter or change it later in the project.</p><WritingStyleFields id="book-style" inputs={{instructions:storySettings.styleInstructions||'',samples:storySettings.proseSamples||''}} onChange={inputs=>setStorySettings({...storySettings,styleInstructions:inputs.instructions,proseSamples:inputs.samples})} disabled={isLoading}/><button type="button" disabled={isLoading||(!storySettings.styleInstructions&&!storySettings.proseSamples)} className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40" onClick={()=>setStorySettings({...storySettings,styleInstructions:'',proseSamples:''})}>Clear style references</button></div></section>}

      {planningOnly && <p className="text-xs text-zinc-500 mt-4">First, the model prepares a shared outline and prompts for every chapter. Prose generation is a separate step.</p>}
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={isLoading || !storyPremise || numChapters < MIN_CHAPTERS || numChapters > MAX_CHAPTERS} variant="primary">
          {isLoading ? 'Preparing…' : planningOnly ? 'Create outline and chapter prompts' : 'Start Generation'}
        </Button>
      </div>

      {planningOnly ? <div className="mt-8 pt-6 border-t border-zinc-800 text-sm text-zinc-400 space-y-2"><h2 className="font-medium text-zinc-200">How it works</h2><p>1. Prompts: enter your premise and settings, then prepare and review the shared outline and chapter prompts.</p><p>2. Story: generate chapters from your saved prompts and writing style.</p><p>3. Editing: review the completed manuscript with the editorial assistant, edit text, compare changes, and undo revisions.</p></div> : <div className="mt-8 pt-6 border-t border-zinc-800 space-y-4 text-zinc-300">
        <div>
          <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            How it works · 4 simple steps
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="p-3.5 rounded border border-zinc-800/80 bg-zinc-900/30 space-y-1.5">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">01. Set up your story</h3>
            <p className="text-xs text-zinc-400/90 leading-relaxed">
              Choose your AI model, enter the story premise, and select your genre and chapter count (3 to 30 chapters).
            </p>
          </div>

          <div className="p-3.5 rounded border border-zinc-800/80 bg-zinc-900/30 space-y-1.5">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">02. Start generation</h3>
            <p className="text-xs text-zinc-400/90 leading-relaxed">
              Click Start Generation. The author model maps the world, character motivations, secrets, and a scene-by-scene outline.
            </p>
          </div>

          <div className="p-3.5 rounded border border-zinc-800/80 bg-zinc-900/30 space-y-1.5">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">03. Watch live in studio</h3>
            <p className="text-xs text-zinc-400/90 leading-relaxed">
              The workspace opens automatically. Follow scenes streaming in real time, view story cards, and track live style checks.
            </p>
          </div>

          <div className="p-3.5 rounded border border-zinc-800/80 bg-zinc-900/30 space-y-1.5">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">04. Review, edit & export</h3>
            <p className="text-xs text-zinc-400/90 leading-relaxed">
              Read the complete draft, edit the manuscript text directly on the page, apply editorial reviews, and save or export your book.
            </p>
          </div>
        </div>
      </div>}
    </form>
  );
};

export default UserInput;
