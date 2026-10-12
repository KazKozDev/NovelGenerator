import React, { useState } from 'react';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';
import { Input } from './common/Input';
import { Combo } from './common/Combo';
import { Select } from './common/Select';
import { GEMINI_MODEL_NAME, MIN_CHAPTERS } from '../constants';
import { GENRE_CHOICES } from '../utils/genreList';
import { fetchHuggingFaceModels } from '../services/hfBrowserService';
import { getStoredProviderConfig, getStoredValidatorConfig, getStoredSecondWriterConfig, saveStoredProviderConfig, saveStoredValidatorConfig, saveStoredSecondWriterConfig } from '../services/llmService';
import { fetchOllamaModels } from '../services/ollamaService';
import { fetchProviderModels } from '../services/qwenBrowserService';
import { LLMProviderConfig, StorySettings } from '../types';

interface UserInputProps {
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
        <label className="block text-sm text-zinc-400">{label}</label>
        <button type="button" onClick={loadHfModels} className="text-xs text-zinc-400 hover:text-zinc-300 underline font-medium">List models</button>
      </div>
      <Combo id={fieldId(label)} value={value || ''} onChange={model => onChange(model.trim())} placeholder="org/model or org/model:provider" className="text-xs py-1.5 font-mono" options={hfModels.map(model => ({ value: model.id, label: model.providers.join(', ') }))} />
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
  // Gemini, Qwen and Anthropic: the models their own servers report, as suggestions for the same kind of field.
  const [listed, setListed] = useState<{ gemini: string[]; qwen: string[]; anthropic: string[] }>({ gemini: [], qwen: [], anthropic: [] });
  const [listNote, setListNote] = useState<{ gemini: string; qwen: string; anthropic: string }>({ gemini: '', qwen: '', anthropic: '' });
  const loadListed = (provider: 'gemini' | 'qwen' | 'anthropic') => { setListNote(note => ({ ...note, [provider]: 'Loading…' })); fetchProviderModels(provider).then(models => { setListed(all => ({ ...all, [provider]: models })); setListNote(note => ({ ...note, [provider]: `${models.length} models from ${provider === 'gemini' ? 'Gemini' : provider === 'qwen' ? 'Qwen' : 'Anthropic'}` })); }, error => setListNote(note => ({ ...note, [provider]: error instanceof Error ? error.message : 'Model list failed' }))); };
  const listedField = (provider: 'gemini' | 'qwen' | 'anthropic', label: string, value: string | undefined, onChange: (model: string) => void, placeholder: string, hint: string) => (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <label className="block text-sm text-zinc-400">{label}</label>
        <button type="button" onClick={() => loadListed(provider)} className="text-xs text-zinc-400 hover:text-zinc-300 underline font-medium">List models</button>
      </div>
      <Combo id={fieldId(label)} value={value || ''} onChange={model => onChange(model.trim())} placeholder={placeholder} className="text-xs py-1.5 font-mono" options={listed[provider].map(model => ({ value: model }))} />
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
        <label className="block text-sm text-zinc-400">{label}</label>
        <button type="button" onClick={loadOllamaModels} className="text-xs text-zinc-400 hover:text-zinc-300 underline font-medium">List models</button>
      </div>
      <Combo id={fieldId(label)} value={value || ''} onChange={model => onChange(model.trim())} placeholder="llama3.1 or name:cloud" className="text-xs py-1.5 font-mono" options={ollamaModels.map(model => ({ value: model }))} />
      <p className="text-xs text-zinc-500">{hint}{ollamaNote ? ` ${ollamaNote}.` : ''}</p>
    </div>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numChapters >= MIN_CHAPTERS) {
      onSubmit();
    } else {
      alert(`Please enter at least ${MIN_CHAPTERS} chapters.`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* AI Model Provider Section */}
      <div className="border border-zinc-800 rounded p-4 md:p-5">
        <div className="space-y-3 mb-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
              <span>Author model</span>
            </h3>
            <p className="text-xs text-zinc-500">The model that writes the book: it keeps the notebook, plans, speaks as its people and writes every chapter.</p>
          </div>
          
          <div className="inline-flex flex-wrap rounded bg-zinc-900 p-1 border border-zinc-800">
            <button
              type="button"
              onClick={() => {
                const updated = { ...providerConfig, provider: 'gemini' as const };
                setProviderConfig(updated);
                saveStoredProviderConfig(updated);
              }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                providerConfig.provider === 'gemini'
                  ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-300'
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
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                providerConfig.provider === 'ollama'
                  ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              Ollama
            </button>
            <button type="button" onClick={()=>{const updated={...providerConfig,provider:'qwen' as const};setProviderConfig(updated);saveStoredProviderConfig(updated)}} className={`px-3 py-1.5 rounded text-xs font-medium ${providerConfig.provider==='qwen'?'bg-zinc-200 text-zinc-900':'text-zinc-400 hover:text-zinc-300'}`}>Qwen</button>
            <button type="button" onClick={()=>{const updated={...providerConfig,provider:'huggingface' as const};setProviderConfig(updated);saveStoredProviderConfig(updated)}} className={`px-3 py-1.5 rounded text-xs font-medium ${providerConfig.provider==='huggingface'?'bg-zinc-200 text-zinc-900':'text-zinc-400 hover:text-zinc-300'}`}>Hugging Face</button>
            <button type="button" onClick={()=>{const updated={...providerConfig,provider:'anthropic' as const};setProviderConfig(updated);saveStoredProviderConfig(updated)}} className={`px-3 py-1.5 rounded text-xs font-medium ${providerConfig.provider==='anthropic'?'bg-zinc-200 text-zinc-900':'text-zinc-400 hover:text-zinc-300'}`}>Anthropic</button>
          </div>
        </div>
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
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">
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
                  className="text-xs py-1.5"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Default /api/ollama (proxied via Vite without CORS)
                </p>
              </div>

              {ollamaField('Ollama model', providerConfig.ollamaModel, model => { const updated = { ...providerConfig, ollamaModel: model }; setProviderConfig(updated); saveStoredProviderConfig(updated); }, 'Any model your Ollama serves, local or cloud.')}
            </div>
          </div>
        )}

        {/* Editor (critic) model — a different model than the writer catches blind spots
            the writer cannot see in its own prose. Off means the writer judges itself. */}
        <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3">
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={validator.enabled}
              onChange={(e) => updateValidator(e.target.checked
                // Entering with the writer's current endpoint so the editor never
                // points at a stale address from an older stored config.
                ? { enabled: true, ollamaEndpoint: providerConfig.ollamaEndpoint }
                : { enabled: false })}
              className="accent-zinc-200"
            />
            <span className="font-medium">Reader model</span>
          </label>
          <p className="text-xs text-zinc-500">
            Another model that reads what the author writes: the reader the author asks about a chapter, and
            the one who says, before the ending, what the book still owes. It sees what the
            author reads past. Off means the author's own model reads its own text.
          </p>

          {validator.enabled && (
            <div className="space-y-3 animate-fade-in">
              <div className="inline-flex flex-wrap rounded bg-zinc-900 p-1 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => updateValidator({ provider: 'gemini' })}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    validator.provider === 'gemini'
                      ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-300'
                  }`}
                >
                  Gemini
                </button>
                <button
                  type="button"
                  onClick={() => updateValidator({ provider: 'ollama' })}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    validator.provider === 'ollama'
                      ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-300'
                  }`}
                >
                  Ollama
                </button>
                <button type="button" onClick={()=>updateValidator({provider:'qwen'})} className={`px-3 py-1.5 rounded text-xs font-medium ${validator.provider==='qwen'?'bg-zinc-200 text-zinc-900':'text-zinc-400 hover:text-zinc-300'}`}>Qwen</button>
                <button type="button" onClick={()=>updateValidator({provider:'huggingface'})} className={`px-3 py-1.5 rounded text-xs font-medium ${validator.provider==='huggingface'?'bg-zinc-200 text-zinc-900':'text-zinc-400 hover:text-zinc-300'}`}>Hugging Face</button>
                <button type="button" onClick={()=>updateValidator({provider:'anthropic'})} className={`px-3 py-1.5 rounded text-xs font-medium ${validator.provider==='anthropic'?'bg-zinc-200 text-zinc-900':'text-zinc-400 hover:text-zinc-300'}`}>Anthropic</button>
              </div>

              {validator.provider === 'anthropic' ? listedField('anthropic', 'Reader Anthropic model', validator.anthropicModel, model => updateValidator({ anthropicModel: model || undefined }), 'claude-opus-5-5', 'Uses ANTHROPIC_API_KEY from .env.local. Empty means claude-opus-5-5.') : validator.provider === 'huggingface' ? hfField('Reader Hugging Face model', validator.hfModel, model => updateValidator({ hfModel: model || undefined })) : validator.provider === 'qwen' ? listedField('qwen', 'Reader Qwen model', validator.qwenModel, model => updateValidator({ qwenModel: model || undefined }), 'qwen3.8-flash', 'Empty means qwen3.8-flash.') : validator.provider === 'gemini' ? (
                listedField('gemini', 'Reader Gemini model', validator.geminiModel, model => updateValidator({ geminiModel: model || undefined }), GEMINI_MODEL_NAME, `Pick a different model than the author. Empty means the default (${GEMINI_MODEL_NAME}).`)
              ) : (
                ollamaField('Reader Ollama model', validator.ollamaModel, model => updateValidator({ ollamaModel: model }), 'Uses the same Ollama endpoint as the author.')
              )}
            </div>
          )}
        </div>

      </div>

      <div>
        <label htmlFor="storyPremise" className="block text-sm font-medium text-zinc-400 mb-1.5">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="genre" className="block text-sm font-medium text-zinc-400 mb-1.5">
            Genre
          </label>
          <Combo id="genre" value={genre} onChange={setGenre} placeholder="thriller" className="text-xs py-1.5 font-mono"
            options={GENRE_CHOICES} />
          <p className="text-xs text-zinc-500 mt-1">Pick one, type to search, or name your own.</p>
        </div>

        <div>
          <label htmlFor="numChapters" className="block text-sm font-medium text-zinc-400 mb-1.5">
            Number of Chapters
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

        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {([
            ['targetAudience', 'Target audience', 'adult', [
              ['adult', 'Grown readers; nothing is held back for age'], ['new adult', 'Readers of 18–25; first jobs, first serious loves'],
              ['young adult', 'Teen readers; teen heroes'], ['middle grade', 'Readers of 8–12']]],
            ['narrativeVoice', 'Narrative voice / POV', 'third-limited', [
              ['third-limited', 'She — inside one head at a time'], ['first-person', 'I — the hero tells it'],
              ['third-omniscient', 'A narrator who knows everyone'], ['multiple POV', 'Several heads, taking turns by chapter'], ['second-person', 'You — rare, close, strange']]],
            ['tone', 'Tone', 'serious', [
              ['serious', 'Played straight'], ['dark', 'Bleak, with real harm'], ['tense', 'Tight, something always about to happen'], ['sensual', 'Bodies, heat, wanting'],
              ['romantic', 'Warm, hopeful about love'], ['melancholic', 'Quiet, with loss in it'], ['humorous', 'Light, funny'], ['ironic', 'Dry, knowing']]],
            ['writingStyle', 'Style and voice notes', 'descriptive', [
              ['descriptive', 'Rich in place and detail'], ['spare', 'Short, plain sentences; little ornament'], ['lyrical', 'Musical, image-led'],
              ['fast-paced', 'Short scenes, quick cuts'], ['dialogue-driven', 'Carried by what people say'], ['cinematic', 'Seen from outside, scene by scene']]],
          ] as const).map(([key, label, fallback, choices]) => (
            <div key={key}>
              <label htmlFor={key} className="block text-sm font-medium text-zinc-400 mb-1.5">{label}</label>
              <Combo id={key} value={storySettings[key] ?? fallback} onChange={value => setStorySettings({ ...storySettings, [key]: value })} placeholder={fallback} className="text-xs py-1.5 font-mono"
                options={choices.map(([value, hint]) => ({ value, label: hint }))} />
              <p className="text-xs text-zinc-500 mt-1">Pick one or say it your way.</p>
            </div>
          ))}
          <div>
            <label htmlFor="intimacy" className="block text-sm font-medium text-zinc-400 mb-1.5">Intimate scenes</label>
            <Combo id="intimacy" value={storySettings.intimacy ?? 'on the page, not faded out'} onChange={intimacy => setStorySettings({ ...storySettings, intimacy })} placeholder="on the page, restrained" className="text-xs py-1.5 font-mono"
              options={[{ value: 'fade to black', label: 'The door closes; the next line is morning' }, { value: 'on the page, restrained', label: 'The scene is written, without detail' }, { value: 'on the page, explicit', label: 'The scene is written in full' }]} />
            <p className="text-xs text-zinc-500 mt-1">How far a love scene goes on the page. Pick one or say it your way.</p>
          </div>
          <div>
            <label htmlFor="targetWords" className="block text-sm font-medium text-zinc-400 mb-1.5">Rough words per chapter</label>
            <Input id="targetWords" type="number" min={300} max={10000} step={100}
              value={storySettings.targetWordsPerChapter || 4000}
              onChange={event => setStorySettings({ ...storySettings, targetWordsPerChapter: Number(event.target.value) })} />
          </div>
          <div>
            <label htmlFor="tense" className="block text-sm font-medium text-zinc-400 mb-1.5">Tense</label>
            <Combo id="tense" value={storySettings.tense ?? 'past'} onChange={tense => setStorySettings({ ...storySettings, tense })} placeholder="past" className="text-xs py-1.5 font-mono"
              options={[{ value: 'past', label: 'She opened the door' }, { value: 'present', label: 'She opens the door' }]} />
            <p className="text-xs text-zinc-500 mt-1">Pick one or say it your way.</p>
          </div>
          <div>
            <label htmlFor="ending" className="block text-sm font-medium text-zinc-400 mb-1.5">Ending</label>
            <Combo id="ending" value={storySettings.ending ?? 'closed'} onChange={ending => setStorySettings({ ...storySettings, ending })} placeholder="closed" className="text-xs py-1.5 font-mono"
              options={[{ value: 'closed', label: 'Resolved' }, { value: 'open', label: 'Intentionally open' }, { value: 'series', label: 'Part of a series' }]} />
            <p className="text-xs text-zinc-500 mt-1">Pick one or say it your way, e.g. closed, bittersweet.</p>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <p className="text-xs text-zinc-500">One author writes the whole book at its desk. The chapter length is a rough size for the book: no chapter is cut or padded to it. While it works, the tabs above the text show what it asks its readers and its people, word for word.</p>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isLoading || !storyPremise || numChapters < MIN_CHAPTERS} variant="primary">
          {isLoading ? 'Starting…' : 'Start Generation'}
        </Button>
      </div>

      <div className="mt-10 pt-8 border-t border-zinc-800 space-y-6 text-zinc-300">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase">
            How the book is written
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">01. Its people</h3>
            <p className="text-xs text-zinc-500">
              Before anything is planned, the author asks its main characters, each from the inside: what they want, what they fear, what they will and will not do. The one the book turns on tells, hour by hour, what they did.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">02. The plan</h3>
            <p className="text-xs text-zinc-500">
              The plan is built from their answers: how the book ends and why, what turns in the middle, what must be set down early. One outside reader asks why things happen as they do, and the author answers once.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">03. The chapters</h3>
            <p className="text-xs text-zinc-500">
              The book is written once and moves forward. Each chapter is written whole and then stands as it is; after each, the author notes what it has fixed, and writes the next with those notes in front of it.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">04. The ending</h3>
            <p className="text-xs text-zinc-500">
              Before the last chapter, a reader says what the book still owes them. The last chapter is written with that in view, and when it is written the book is done: nothing is read or rewritten after.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};

export default UserInput;
