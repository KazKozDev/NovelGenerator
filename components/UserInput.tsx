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
      <div className="bg-slate-900/50 border border-slate-700/80 rounded-xl p-4 md:p-5 shadow-inner">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-sky-300 uppercase tracking-wider flex items-center gap-2">
              <span>🤖 AI Provider</span>
            </h3>
            <p className="text-xs text-slate-400">Choose inference provider (Google Gemini or Local Ollama)</p>
          </div>
          
          <div className="inline-flex rounded-lg bg-slate-800 p-1 border border-slate-700 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                const updated = { ...providerConfig, provider: 'gemini' as const };
                setProviderConfig(updated);
                saveStoredProviderConfig(updated);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                providerConfig.provider === 'gemini'
                  ? 'bg-sky-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
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
                  ? 'bg-sky-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Ollama (Local)
            </button>
          </div>
        </div>

        {/* Ollama Details */}
        {providerConfig.provider === 'ollama' && (
          <div className="mt-4 pt-3 border-t border-slate-700/80 space-y-3 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
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
                  className="bg-slate-800 border-slate-600 text-xs py-1.5"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Default <code className="text-sky-300">/api/ollama</code> (proxied via Vite without CORS)
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Ollama Model
                  </label>
                  <button
                    type="button"
                    onClick={handleFetchOllamaModels}
                    disabled={isFetchingModels}
                    className="text-[11px] text-sky-400 hover:text-sky-300 underline font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    {isFetchingModels ? '⏳ Loading...' : '🔄 Load models from Ollama'}
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
                    className="bg-slate-800 border-slate-600 text-xs py-1.5"
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
                    className="bg-slate-800 border-slate-600 text-xs py-1.5"
                  />
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  {ollamaModels.length > 0
                    ? `Selected from ${ollamaModels.length} locally installed models`
                    : `Click "Load models" to retrieve models from local Ollama instance`}
                </p>
              </div>
            </div>

            {fetchStatus && (
              <div
                className={`text-xs px-3 py-2 rounded-md ${
                  fetchStatus.success
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                }`}
              >
                {fetchStatus.message}
              </div>
            )}
          </div>
        )}
      </div>
      <div>
        <label htmlFor="storyPremise" className="block text-sm font-medium text-sky-300 mb-1">
          Story Premise
        </label>
        <TextArea
          id="storyPremise"
          value={storyPremise}
          onChange={(e) => setStoryPremise(e.target.value)}
          placeholder="Enter a paragraph describing your story idea (e.g., A detective uncovers a conspiracy that threatens everything they believe in...)"
          rows={5}
          required
          maxLength={1200} 
          className="bg-slate-700 border-slate-600 focus:ring-sky-500 focus:border-sky-500"
        />
        <p className="text-xs text-slate-400 mt-1">Max 1200 characters. Be descriptive</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="genre" className="block text-sm font-medium text-sky-300 mb-1">
            Genre
          </label>
          <Select
            id="genre"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="bg-slate-700 border-slate-600 focus:ring-sky-500 focus:border-sky-500"
          >
            {Object.entries(GENRE_CONFIGS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name} - {config.description}
              </option>
            ))}
          </Select>
          <p className="text-xs text-slate-400 mt-1">Choose your story genre</p>
        </div>

        <div>
          <label htmlFor="numChapters" className="block text-sm font-medium text-sky-300 mb-1">
            Number of Chapters
          </label>
          <Input
            id="numChapters"
            type="number"
            value={numChapters}
            onChange={(e) => setNumChapters(Math.max(MIN_CHAPTERS, parseInt(e.target.value, 10) || MIN_CHAPTERS))}
            min={MIN_CHAPTERS}
            required
            className="bg-slate-700 border-slate-600 focus:ring-sky-500 focus:border-sky-500"
          />
           <p className="text-xs text-slate-400 mt-1">Minimum {MIN_CHAPTERS} chapters</p>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="speedMode" className="block text-sm font-medium text-sky-300 mb-1">
            ⚡ Generation Speed Mode
          </label>
          <Select
            id="speedMode"
            value={generationSpeedMode}
            onChange={(e) => setGenerationSpeedMode(e.target.value as GenerationSpeedMode)}
            className="bg-slate-700 border-slate-600 focus:ring-sky-500 focus:border-sky-500"
          >
            <option value="fast">⚡ Fast (Single-pass — skips redundant chapter rewrite, 2x faster for Ollama)</option>
            <option value="thorough">🔍 Thorough (Dual-pass — full secondary polish and rewrite)</option>
          </Select>
          <p className="text-xs text-slate-400 mt-1">
            {generationSpeedMode === 'fast'
              ? 'Synthesizes structure, character arcs, and scene details into prose in a single pass. Saves thousands of tokens and doubles generation speed.'
              : 'Each chapter is synthesized, then rewritten and polished a second time from scratch.'}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading || !storyPremise || numChapters < MIN_CHAPTERS} variant="primary">
          {isLoading ? 'Weaving Your Tale...' : 'Start Weaving'}
        </Button>
      </div>
       <div className="mt-12 pt-12 border-t border-slate-700 space-y-8 text-slate-300">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300 mb-2">
            How to begin
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">01. Start with your vision</h3>
            <p className="text-sm text-slate-400">
              Choose your genre. Set your chapter count. Share your story idea. That's all we need.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">02. Intelligence meets creativity</h3>
            <p className="text-sm text-slate-400">
              Our AI builds a complete story architecture — plot progression, character arcs, emotional beats. Every detail mapped before the first word is written.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">03. You stay in control</h3>
            <p className="text-sm text-slate-400">
              Review the outline. Refine it. Approve when it feels right. This is your story. We're just here to help bring it to life.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">04. Three specialists. One masterpiece</h3>
            <p className="text-sm text-slate-400">
              Structure. Character. Scene. Each specialized AI agent focuses on what it does best, collaborating in real-time to craft every chapter with precision.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">05. Quality built in</h3>
            <p className="text-sm text-slate-400">
              Every chapter undergoes multiple editing passes. Consistency checks. Narrative flow analysis. We catch what humans miss.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">06. The final polish</h3>
            <p className="text-sm text-slate-400">
              Rhythm. Subtext. Emotional resonance. Our pipeline refines every sentence until your story doesn't just read well — it feels right.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">07. In your format</h3>
            <p className="text-sm text-slate-400">
              Download your manuscript in PDF, TXT, or EPUB format. Ready for sharing or further editing.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};

export default UserInput;
