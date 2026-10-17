import React, { useState, useEffect } from 'react';
import { LLMProviderConfig, LLMProviderType } from '../types';
import { fetchProviderModels } from '../services/qwenBrowserService';
import { fetchOllamaModels, DEFAULT_OLLAMA_ENDPOINT, DEFAULT_OLLAMA_MODEL } from '../services/ollamaService';
import { fetchHuggingFaceModels } from '../services/hfBrowserService';
import { GEMINI_MODEL_NAME } from '../constants';
import { Combo } from './common/Combo';
import { Input } from './common/Input';

export interface EditorialModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig?: LLMProviderConfig;
  onSave: (config: LLMProviderConfig) => void;
}

export function EditorialModelModal({
  isOpen,
  onClose,
  currentConfig,
  onSave,
}: EditorialModelModalProps) {
  const [config, setConfig] = useState<LLMProviderConfig>(() => ({
    provider: currentConfig?.provider || 'gemini',
    ollamaEndpoint: currentConfig?.ollamaEndpoint || DEFAULT_OLLAMA_ENDPOINT,
    ollamaModel: currentConfig?.ollamaModel || DEFAULT_OLLAMA_MODEL,
    geminiModel: currentConfig?.geminiModel,
    qwenModel: currentConfig?.qwenModel,
    hfModel: currentConfig?.hfModel,
    anthropicModel: currentConfig?.anthropicModel,
    compatibleModel: currentConfig?.compatibleModel,
  }));

  const [compatibleUrl, setCompatibleUrl] = useState('');
  const [compatibleDirty, setCompatibleDirty] = useState(false);
  const [compatibleNote, setCompatibleNote] = useState('');

  const [listed, setListed] = useState<{
    gemini: string[];
    qwen: string[];
    anthropic: string[];
    compatible: string[];
  }>({ gemini: [], qwen: [], anthropic: [], compatible: [] });

  const [listNote, setListNote] = useState<{
    gemini: string;
    qwen: string;
    anthropic: string;
    compatible: string;
  }>({ gemini: '', qwen: '', anthropic: '', compatible: '' });

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaNote, setOllamaNote] = useState('');

  const [hfModels, setHfModels] = useState<{ id: string; providers: string[] }[]>([]);
  const [hfNote, setHfNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (currentConfig) {
      setConfig({
        provider: currentConfig.provider || 'gemini',
        ollamaEndpoint: currentConfig.ollamaEndpoint || DEFAULT_OLLAMA_ENDPOINT,
        ollamaModel: currentConfig.ollamaModel || DEFAULT_OLLAMA_MODEL,
        geminiModel: currentConfig.geminiModel,
        qwenModel: currentConfig.qwenModel,
        hfModel: currentConfig.hfModel,
        anthropicModel: currentConfig.anthropicModel,
        compatibleModel: currentConfig.compatibleModel,
      });
    }

    let active = true;
    fetch('/api/keys')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load API settings');
        if (active && !compatibleDirty) {
          setCompatibleUrl((current) => current || data.keys?.COMPATIBLE_BASE_URL?.value || '');
        }
      })
      .catch((error) => {
        if (active) setCompatibleNote(error instanceof Error ? error.message : 'Could not load API settings');
      });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      active = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, currentConfig, onClose, compatibleDirty]);

  if (!isOpen) return null;

  const saveCompatibleUrl = async (): Promise<boolean> => {
    if (!compatibleDirty) return true;
    try {
      const url = new URL(compatibleUrl.trim());
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error('Enter an HTTP(S) base URL without credentials, query or fragment.');
      }
      setCompatibleNote('Saving…');
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'COMPATIBLE_BASE_URL', value: compatibleUrl.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save base URL');
      setCompatibleDirty(false);
      setCompatibleNote('Saved');
      return true;
    } catch (error) {
      setCompatibleNote(error instanceof Error ? error.message : 'Could not save base URL');
      return false;
    }
  };

  const loadListed = async (provider: 'gemini' | 'qwen' | 'anthropic' | 'compatible') => {
    if (provider === 'compatible' && !(await saveCompatibleUrl())) return;
    setListNote((note) => ({ ...note, [provider]: 'Loading…' }));
    fetchProviderModels(provider).then(
      (models) => {
        setListed((all) => ({ ...all, [provider]: models }));
        setListNote((note) => ({
          ...note,
          [provider]: `${models.length} models from ${
            provider === 'gemini'
              ? 'Gemini'
              : provider === 'qwen'
              ? 'Qwen'
              : provider === 'compatible'
              ? 'Compatible API'
              : 'Anthropic'
          }`,
        }));
      },
      (error) =>
        setListNote((note) => ({
          ...note,
          [provider]: error instanceof Error ? error.message : 'Model list failed',
        }))
    );
  };

  const loadOllamaModels = () => {
    setOllamaNote('Loading…');
    fetchOllamaModels(config.ollamaEndpoint).then(
      (models) => {
        setOllamaModels(models);
        setOllamaNote(
          models.length ? `${models.length} models in Ollama` : 'Ollama reachable, but model list is empty'
        );
      },
      (error) => setOllamaNote(error instanceof Error ? error.message : 'Cannot connect to Ollama')
    );
  };

  const loadHfModels = () => {
    setHfNote('Loading…');
    fetchHuggingFaceModels().then(
      (models) => {
        setHfModels(models);
        setHfNote(`${models.length} models on the router`);
      },
      (error) => setHfNote(error instanceof Error ? error.message : 'Model list failed')
    );
  };

  const handleApply = async () => {
    if (config.provider === 'compatible') {
      const ok = await saveCompatibleUrl();
      if (!ok) return;
    }
    onSave(config);
    onClose();
  };

  const providers: { id: LLMProviderType; label: string }[] = [
    { id: 'gemini', label: 'Gemini' },
    { id: 'ollama', label: 'Ollama' },
    { id: 'qwen', label: 'Qwen' },
    { id: 'huggingface', label: 'Hugging Face' },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'compatible', label: 'API compatible' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editorial-model-title"
        className="relative w-full max-w-[620px] max-h-[92dvh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start gap-3 justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/60 shrink-0">
          <div className="min-w-0">
            <h2 id="editorial-model-title" className="text-base font-semibold text-zinc-100">
              Assistant Model & Provider
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Select the LLM engine and specific model powering the Section 3 Editorial Assistant.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close (Esc)"
            className="shrink-0 p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-5 space-y-5 text-xs text-zinc-300">
          {/* Provider selector buttons */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-300">Provider</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 bg-zinc-950 p-1 rounded-md border border-zinc-800">
              {providers.map((p) => {
                const active = config.provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, provider: p.id }))}
                    className={`h-7 px-2 text-xs font-medium rounded transition-colors truncate ${
                      active
                        ? 'bg-zinc-200 text-zinc-900 font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gemini */}
          {config.provider === 'gemini' && (
            <div className="space-y-3 pt-3 border-t border-zinc-800 animate-fadeIn">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <label className="block text-xs font-medium text-zinc-300">Gemini model</label>
                <button
                  type="button"
                  onClick={() => loadListed('gemini')}
                  className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors"
                >
                  List models
                </button>
              </div>
              <Combo
                id="editorial-gemini-model"
                value={config.geminiModel || ''}
                onChange={(model) =>
                  setConfig((prev) => ({
                    ...prev,
                    geminiModel: model ? model.trim() : undefined,
                  }))
                }
                placeholder={GEMINI_MODEL_NAME}
                className="text-xs font-mono"
                options={listed.gemini.map((m) => ({ value: m }))}
              />
              <p className="text-[11px] text-zinc-500">
                Any Gemini model ID. Empty means default ({GEMINI_MODEL_NAME}).
                {listNote.gemini ? ` ${listNote.gemini}.` : ''}
              </p>
            </div>
          )}

          {/* Ollama */}
          {config.provider === 'ollama' && (
            <div className="space-y-4 pt-3 border-t border-zinc-800 animate-fadeIn">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  Ollama Endpoint / Proxy
                </label>
                <Input
                  type="text"
                  value={config.ollamaEndpoint}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, ollamaEndpoint: e.target.value }))
                  }
                  placeholder="/api/ollama"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-zinc-500">
                  Default /api/ollama (proxied via Vite without CORS)
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <label className="block text-xs font-medium text-zinc-300">Ollama model</label>
                  <button
                    type="button"
                    onClick={loadOllamaModels}
                    className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors"
                  >
                    List models
                  </button>
                </div>
                <Combo
                  id="editorial-ollama-model"
                  value={config.ollamaModel || ''}
                  onChange={(model) =>
                    setConfig((prev) => ({ ...prev, ollamaModel: model.trim() }))
                  }
                  placeholder="qwen2.5:32b or llama3.3:70b"
                  className="text-xs font-mono"
                  options={ollamaModels.map((m) => ({ value: m }))}
                />
                <p className="text-[11px] text-zinc-500">
                  Any model your Ollama server provides.
                  {ollamaNote ? ` ${ollamaNote}.` : ''}
                </p>
              </div>
            </div>
          )}

          {/* Qwen */}
          {config.provider === 'qwen' && (
            <div className="space-y-3 pt-3 border-t border-zinc-800 animate-fadeIn">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <label className="block text-xs font-medium text-zinc-300">Qwen model</label>
                <button
                  type="button"
                  onClick={() => loadListed('qwen')}
                  className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors"
                >
                  List models
                </button>
              </div>
              <Combo
                id="editorial-qwen-model"
                value={config.qwenModel || ''}
                onChange={(model) =>
                  setConfig((prev) => ({
                    ...prev,
                    qwenModel: model ? model.trim() : undefined,
                  }))
                }
                placeholder="qwen3.8-flash"
                className="text-xs font-mono"
                options={listed.qwen.map((m) => ({ value: m }))}
              />
              <p className="text-[11px] text-zinc-500">
                Uses QWEN_API_KEY from .env.local. Empty means default qwen3.8-flash.
                {listNote.qwen ? ` ${listNote.qwen}.` : ''}
              </p>
            </div>
          )}

          {/* Hugging Face */}
          {config.provider === 'huggingface' && (
            <div className="space-y-3 pt-3 border-t border-zinc-800 animate-fadeIn">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <label className="block text-xs font-medium text-zinc-300">
                  Hugging Face model
                </label>
                <button
                  type="button"
                  onClick={loadHfModels}
                  className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors"
                >
                  List models
                </button>
              </div>
              <Combo
                id="editorial-hf-model"
                value={config.hfModel || ''}
                onChange={(model) =>
                  setConfig((prev) => ({
                    ...prev,
                    hfModel: model ? model.trim() : undefined,
                  }))
                }
                placeholder="org/model or org/model:provider"
                className="text-xs font-mono"
                options={hfModels.map((m) => ({ value: m.id, label: m.providers.join(', ') }))}
              />
              <p className="text-[11px] text-zinc-500">
                Uses HF_TOKEN from .env.local. You can append :provider or :fastest.
                {hfNote ? ` ${hfNote}.` : ''}
              </p>
            </div>
          )}

          {/* Anthropic */}
          {config.provider === 'anthropic' && (
            <div className="space-y-3 pt-3 border-t border-zinc-800 animate-fadeIn">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <label className="block text-xs font-medium text-zinc-300">Anthropic model</label>
                <button
                  type="button"
                  onClick={() => loadListed('anthropic')}
                  className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors"
                >
                  List models
                </button>
              </div>
              <Combo
                id="editorial-anthropic-model"
                value={config.anthropicModel || ''}
                onChange={(model) =>
                  setConfig((prev) => ({
                    ...prev,
                    anthropicModel: model ? model.trim() : undefined,
                  }))
                }
                placeholder="claude-opus-5-5"
                className="text-xs font-mono"
                options={listed.anthropic.map((m) => ({ value: m }))}
              />
              <p className="text-[11px] text-zinc-500">
                Uses ANTHROPIC_API_KEY from .env.local. Empty means claude-opus-5-5.
                {listNote.anthropic ? ` ${listNote.anthropic}.` : ''}
              </p>
            </div>
          )}

          {/* API compatible */}
          {config.provider === 'compatible' && (
            <div className="space-y-4 pt-3 border-t border-zinc-800 animate-fadeIn">
              <div className="space-y-1.5">
                <label
                  htmlFor="editorial-api-base-url"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Base URL
                </label>
                <Input
                  id="editorial-api-base-url"
                  value={compatibleUrl}
                  onChange={(e) => {
                    setCompatibleUrl(e.target.value);
                    setCompatibleDirty(true);
                    setCompatibleNote('Unsaved');
                  }}
                  placeholder="http://127.0.0.1:8085/v1/"
                  className="font-mono text-xs"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-zinc-500">
                    Include /v1 if required. {compatibleNote}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void saveCompatibleUrl();
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors"
                  >
                    Save URL
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <label className="block text-xs font-medium text-zinc-300">API model</label>
                  <button
                    type="button"
                    onClick={() => loadListed('compatible')}
                    className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors"
                  >
                    List models
                  </button>
                </div>
                <Combo
                  id="editorial-compatible-model"
                  value={config.compatibleModel || ''}
                  onChange={(model) =>
                    setConfig((prev) => ({
                      ...prev,
                      compatibleModel: model ? model.trim() : undefined,
                    }))
                  }
                  placeholder="model-id"
                  className="text-xs font-mono"
                  options={listed.compatible.map((m) => ({ value: m }))}
                />
                <p className="text-[11px] text-zinc-500">
                  OpenAI-compatible Chat Completions. Key in API settings.
                  {listNote.compatible ? ` ${listNote.compatible}.` : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-3 px-5 py-3 border-t border-zinc-800 bg-zinc-950/60 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-md font-medium text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded-md text-xs transition-colors"
          >
            Apply model
          </button>
        </footer>
      </div>
    </div>
  );
}

export default EditorialModelModal;
