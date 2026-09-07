import React, { useState } from 'react';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';
import { Input } from './common/Input';
import { Select } from './common/Select';
import { MIN_CHAPTERS } from '../constants';
import { GENRE_CONFIGS } from '../utils/genrePrompts';
import { getStoredProviderConfig, saveStoredProviderConfig } from '../services/llmService';
import { fetchOllamaModels } from '../services/ollamaService';
import { LLMProviderConfig, GenerationSpeedMode } from '../types';

interface UserInputProps {
  storyPremise: string;
  setStoryPremise: (value: string) => void;
  numChapters: number;
  setNumChapters: (value: number) => void;
  genre: string;
  setGenre: (value: string) => void;
  generationSpeedMode: GenerationSpeedMode;
  setGenerationSpeedMode: (mode: GenerationSpeedMode) => void;
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
  generationSpeedMode,
  setGenerationSpeedMode,
  onSubmit,
  isLoading,
}) => {
  const [providerConfig, setProviderConfig] = useState<LLMProviderConfig>(() => getStoredProviderConfig());
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
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 md:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
              <span>AI Provider</span>
            </h3>
            <p className="text-xs text-zinc-500">Choose inference provider (Google Gemini or Local Ollama)</p>
          </div>
          
          <div className="inline-flex rounded-lg bg-zinc-900 p-1 border border-zinc-800 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                const updated = { ...providerConfig, provider: 'gemini' as const };
                setProviderConfig(updated);
                saveStoredProviderConfig(updated);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                providerConfig.provider === 'gemini'
                  ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Google Gemini
            </button>
            <button
              type="button"
              onClick={() => {
                const updated = { ...providerConfig, provider: 'ollama' as const };
                setProviderConfig(updated);
                saveStoredProviderConfig(updated);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                providerConfig.provider === 'ollama'
                  ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Ollama (Local)
            </button>
          </div>
        </div>

        {/* Ollama Details */}
        {providerConfig.provider === 'ollama' && (
          <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
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
                <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                  Default /api/ollama (proxied via Vite without CORS)
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-300">
                    Ollama Model
                  </label>
                  <button
                    type="button"
                    onClick={handleFetchOllamaModels}
                    disabled={isFetchingModels}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 underline font-mono font-medium flex items-center gap-1 disabled:opacity-50"
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
                <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                  {ollamaModels.length > 0
                    ? `Selected from ${ollamaModels.length} locally installed models`
                    : `Click "Fetch Ollama Models" to retrieve models`}
                </p>
              </div>
            </div>

            {fetchStatus && (
              <div
                className={`text-xs px-3 py-2 rounded-lg font-mono ${
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
        <label htmlFor="storyPremise" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1">
          Story Premise
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
          <label htmlFor="genre" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1">
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
          <label htmlFor="numChapters" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1">
            Number of Chapters
          </label>
          <Input
            id="numChapters"
            type="number"
            value={numChapters}
            onChange={(e) => setNumChapters(Math.max(MIN_CHAPTERS, parseInt(e.target.value, 10) || MIN_CHAPTERS))}
            min={MIN_CHAPTERS}
            required
          />
           <p className="text-xs text-zinc-500 mt-1">Minimum {MIN_CHAPTERS} chapters</p>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="speedMode" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1">
            Generation Speed Mode
          </label>
          <Select
            id="speedMode"
            value={generationSpeedMode}
            onChange={(e) => setGenerationSpeedMode(e.target.value as GenerationSpeedMode)}
          >
            <option value="fast">Fast (Single-pass — skips redundant chapter rewrite, 2x faster)</option>
            <option value="thorough">Thorough (Dual-pass — full secondary polish and rewrite)</option>
          </Select>
          <p className="text-xs text-zinc-500 mt-1">
            {generationSpeedMode === 'fast'
              ? 'Single-pass synthesis: merges structure, character, and scene directly into prose. Saves ~4,000 tokens per chapter.'
              : 'Dual-pass synthesis: full chapter rewrite and secondary polish pass.'}
          </p>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isLoading || !storyPremise || numChapters < MIN_CHAPTERS} variant="primary">
          {isLoading ? 'Generating Outline...' : 'Start Generation'}
        </Button>
      </div>

      <div className="mt-10 pt-8 border-t border-zinc-800 space-y-6 text-zinc-300">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Pipeline Architecture
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">01. Master Story Outline</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Establishes premise, characters, central conflicts, recurring motifs, and comprehensive chapter-by-chapter plans.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">02. Multi-Agent Specialization</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Sequential specialist agents generate narrative structure, character dialogue, and scene sensory details into distinct slots.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">03. Synthesis & Coherence</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Merges specialist modules, generates connective transitions, and updates persistent story memory across chapters.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-200 uppercase tracking-wide">04. Quality & Export</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Automated coherence and repetition verification followed by one-click export into EPUB, TXT, or PDF format.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};

export default UserInput;
