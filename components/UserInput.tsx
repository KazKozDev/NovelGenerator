import React, { useState } from 'react';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';
import { Input } from './common/Input';
import { Select } from './common/Select';
import { GEMINI_MODEL_NAME, MIN_CHAPTERS } from '../constants';
import { GENRE_CONFIGS } from '../utils/genrePrompts';
import { getStoredProviderConfig, getStoredValidatorConfig, saveStoredProviderConfig, saveStoredValidatorConfig } from '../services/llmService';
import { fetchOllamaModels } from '../services/ollamaService';
import LocalModelToggles from './LocalModelToggles';
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
    return { ...(stored || getStoredProviderConfig()), think: stored?.think ?? true, enabled: Boolean(stored) };
  });

  const updateValidator = (change: Partial<LLMProviderConfig & { enabled: boolean }>) => {
    const next = { ...validator, ...change };
    setValidator(next);
    saveStoredValidatorConfig(next.enabled ? next : undefined);
  };
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [fetchStatus, setFetchStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleFetchOllamaModels = async () => {
    setIsFetchingModels(true);
    setFetchStatus(null);
    try {
      const models = await fetchOllamaModels(providerConfig.ollamaEndpoint);
      setOllamaModels(models);
      if (models.length > 0) {
        setFetchStatus({ success: true, message: `Found ${models.length} models in Ollama` });
        if (!models.includes(providerConfig.ollamaModel)) {
          const updated = { ...providerConfig, ollamaModel: models[0] };
          setProviderConfig(updated);
          saveStoredProviderConfig(updated);
        }
      } else {
        setFetchStatus({
          success: false,
          message: 'Ollama is reachable, but model list is empty. Pull a model via `ollama pull llama3.1`.'
        });
      }
    } catch (err: any) {
      setFetchStatus({
        success: false,
        message: err.message || 'Cannot connect to Ollama. Make sure Ollama server is running.'
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
              <span>AI provider</span>
            </h3>
            <p className="text-xs text-zinc-500">Choose inference provider: Gemini or Ollama</p>
          </div>
          
          <div className="inline-flex rounded bg-zinc-900 p-1 border border-zinc-800 self-start sm:self-auto">
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
          </div>
        </div>

        {/* Gemini Details */}
        {providerConfig.provider === 'gemini' && (
          <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3 animate-fade-in">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Gemini Model
              </label>
              <Input
                type="text"
                value={providerConfig.geminiModel || ''}
                onChange={(e) => {
                  const typed = e.target.value.trim();
                  const updated = { ...providerConfig };
                  if (typed) updated.geminiModel = typed;
                  else delete updated.geminiModel;
                  setProviderConfig(updated);
                  saveStoredProviderConfig(updated);
                }}
                placeholder={GEMINI_MODEL_NAME}
                className="text-xs py-1.5 font-mono"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Type any Gemini model ID — empty means the default ({GEMINI_MODEL_NAME})
              </p>
            </div>
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
                  }}
                  placeholder="/api/ollama"
                  className="text-xs py-1.5"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Default /api/ollama (proxied via Vite without CORS)
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-zinc-400">
                    Ollama Model
                  </label>
                  <button
                    type="button"
                    onClick={handleFetchOllamaModels}
                    disabled={isFetchingModels}
                    className="text-xs text-zinc-400 hover:text-zinc-300 underline font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    {isFetchingModels ? 'Loading...' : 'Fetch Ollama Models'}
                  </button>
                </div>

                {ollamaModels.length > 0 ? (
                  <Select
                    value={providerConfig.ollamaModel}
                    onChange={(e) => {
                      const updated = { ...providerConfig, ollamaModel: e.target.value };
                      setProviderConfig(updated);
                      saveStoredProviderConfig(updated);
                    }}
                    className="text-xs py-1.5"
                  >
                    {ollamaModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type="text"
                    value={providerConfig.ollamaModel}
                    onChange={(e) => {
                      const updated = { ...providerConfig, ollamaModel: e.target.value };
                      setProviderConfig(updated);
                      saveStoredProviderConfig(updated);
                    }}
                    placeholder="llama3.1"
                    className="text-xs py-1.5"
                  />
                )}
                <p className="text-xs text-zinc-500 mt-1">
                  {ollamaModels.length > 0
                    ? `Selected from ${ollamaModels.length} models Ollama reports`
                    : `Click "Fetch Ollama Models" to retrieve models`}
                </p>
              </div>
            </div>

            {fetchStatus && (
              <div
                className={`text-xs px-3 py-2 rounded ${
                  fetchStatus.success
                    ? 'bg-emerald-950/40 text-emerald-300/90 border border-emerald-900/60'
                    : 'bg-red-950/40 text-red-300/90 border border-red-900/60'
                }`}
              >
                {fetchStatus.message}
              </div>
            )}
          </div>
        )}

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
          <Select
            id="genre"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
          >
            {Object.entries(GENRE_CONFIGS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name} — {config.description}
              </option>
            ))}
          </Select>
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
            ['language', 'Language', 'English'],
            ['targetAudience', 'Target audience', 'adult'],
            ['narrativeVoice', 'Narrative voice / POV', 'third-limited'],
            ['tone', 'Tone', 'serious'],
            ['writingStyle', 'Style and voice notes', 'descriptive'],
          ] as const).map(([key, label, fallback]) => (
            <div key={key}>
              <label htmlFor={key} className="block text-sm font-medium text-zinc-400 mb-1.5">{label}</label>
              <Input id={key} value={storySettings[key] || fallback}
                onChange={event => setStorySettings({ ...storySettings, [key]: event.target.value })} />
            </div>
          ))}
          <div>
            <label htmlFor="targetWords" className="block text-sm font-medium text-zinc-400 mb-1.5">Target words per chapter</label>
            <Input id="targetWords" type="number" min={300} max={10000} step={100}
              value={storySettings.targetWordsPerChapter || 4000}
              onChange={event => setStorySettings({ ...storySettings, targetWordsPerChapter: Number(event.target.value) })} />
          </div>
          <div>
            <label htmlFor="chapterMode" className="block text-sm font-medium text-zinc-400 mb-1.5">Chapter drafting mode</label>
            <Select id="chapterMode" value={storySettings.chapterMode || 'auto'} onChange={event => setStorySettings({ ...storySettings, chapterMode: event.target.value === 'auto' ? undefined : event.target.value as 'full' | 'scene' })}>
              <option value="auto">Automatic — whole short chapters, scenes for long chapters</option>
              <option value="scene">Scene by scene (recommended for 2500–5000 words — full volume & deep dialogue)</option>
              <option value="full">Full chapter in 1 prompt (fast — best for up to 1500–2000 words)</option>
            </Select>
          </div>
          <div>
            <label htmlFor="tense" className="block text-sm font-medium text-zinc-400 mb-1.5">Tense</label>
            <Select id="tense" value={storySettings.tense || 'past'} onChange={event => setStorySettings({ ...storySettings, tense: event.target.value as StorySettings['tense'] })}>
              <option value="past">Past</option><option value="present">Present</option>
            </Select>
          </div>
          <div>
            <label htmlFor="ending" className="block text-sm font-medium text-zinc-400 mb-1.5">Ending</label>
            <Select id="ending" value={storySettings.ending || 'closed'} onChange={event => setStorySettings({ ...storySettings, ending: event.target.value as StorySettings['ending'] })}>
              <option value="closed">Resolved</option><option value="open">Intentionally open</option><option value="series">Part of a series</option>
            </Select>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <p className="text-xs text-zinc-500">Chapters are written sequentially with story memory. Optional editing is available after the book is complete.</p>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isLoading || !storyPremise || numChapters < MIN_CHAPTERS} variant="primary">
          {isLoading ? 'Generating Outline...' : 'Start Generation'}
        </Button>
      </div>

      <div className="mt-10 pt-8 border-t border-zinc-800 space-y-6 text-zinc-300">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase">
            How your manuscript develops
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">01. Master Story Outline</h3>
            <p className="text-xs text-zinc-500">
              Establishes premise, characters, central conflicts, recurring motifs, and comprehensive chapter-by-chapter plans.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">02. Scene writing</h3>
            <p className="text-xs text-zinc-500">
              Each scene follows its characters’ goals, conflicts and consequential choices in your requested voice.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">03. Continuity and revision</h3>
            <p className="text-xs text-zinc-500">
              Accepted passages establish the story’s facts. Revisions trigger fresh checks of affected chapters.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">04. Quality & Export</h3>
            <p className="text-xs text-zinc-500">
              Download the finished book immediately. Request a separate review and save edits as a new version.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};

export default UserInput;
