import React, { useState, useMemo, useEffect } from 'react';
import BookStatistics from './BookStatistics';

import { extractBookTitle } from '../utils/exportUtils';
import { MarkdownView } from './common/MarkdownView';
import MarkdownChangesView from './MarkdownChangesView';
import BookCoverUpload, { ImprintData } from './BookCoverUpload';
import {
  repairSingleFinding,
  repairSurgicalTask,
  clusterEditorialFindings,
  ClusteredEditorialTask,
  parseModelConfigFromTag,
  formatModelDisplayLabel,
} from '../utils/novel/targetedEditorial';
import { parseBookChapters } from '../utils/novel/manuscript';
import { generateText, getStoredProviderConfig, getStoredValidatorConfig } from '../services/llmService';
import EditorialChatStudio from './EditorialChatStudio';
import { pushUndoState, popUndoState, UndoStackEntry } from '../utils/novel/patchApplier';

interface BookDisplayProps {
  bookContent: string;
  metadataJson: string;
  onReset: () => void;
  onEdit?: () => void;
  isEditorialRunning?: boolean;
  editorialStatus?: string;
  onManualSave?: (newContent: string) => boolean;
  author?: string;
  onAuthorChange?: (author: string) => void;
  imprint?: ImprintData;
  onImprintChange?: (imprint: ImprintData) => void;
  coverImage?: string | null;
  onCoverChange?: (coverUrl: string | null) => void;
}

const BookDisplay: React.FC<BookDisplayProps> = ({
  bookContent,
  metadataJson,
  onReset,
  onEdit,
  isEditorialRunning,
  editorialStatus,
  onManualSave,
  author,
  onAuthorChange,
  imprint,
  onImprintChange,
  coverImage,
  onCoverChange,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const [currentAuthor, setCurrentAuthor] = useState<string>(() => {
    if (author) return author;
    try {
      const parsed = JSON.parse(metadataJson);
      if (parsed?.author) return parsed.author;
    } catch {}
    try {
      return localStorage.getItem('novel_author_name') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (author !== undefined) {
      setCurrentAuthor(author);
    }
  }, [author]);

  const handleAuthorChange = (newAuthor: string) => {
    setCurrentAuthor(newAuthor);
    onAuthorChange?.(newAuthor);
  };

  const metadata = useMemo(() => {
    try {
      return JSON.parse(metadataJson);
    } catch (e) {
      console.error("Failed to parse metadata JSON:", e);
      return null;
    }
  }, [metadataJson]);

  const displayTitle = useMemo(() => {
    if (metadata?.title && typeof metadata.title === 'string' && metadata.title.trim()) {
      return metadata.title.trim();
    }
    const extracted = extractBookTitle(bookContent);
    return extracted && extracted !== 'Untitled Book' ? extracted : 'Manuscript Draft';
  }, [metadata?.title, bookContent]);

  const findingsCount = metadata?.audit?.findings?.length || 0;
  const landmarksCount = metadata?.craft?.landmarks?.length || 0;
  const unavailableCount = metadata?.audit?.need_more_evidence?.length || 0;
  const chapterMatches = bookContent.match(/^##\s+Chapter\s+\d+/gm);
  const chapterCount = chapterMatches ? chapterMatches.length : (metadata?.chapters_count || 1);

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy text. Please try manually.');
    });
  };

  const manuscriptWithTitle = useMemo(() => {
    if (/^#\s+[^\r\n]+/m.test(bookContent)) {
      return bookContent;
    }
    return `# ${displayTitle}\n\n${bookContent}`;
  }, [bookContent, displayTitle]);

  const [isEditing, setIsEditing] = useState(false);
  const [editableContent, setEditableContent] = useState(manuscriptWithTitle);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Targeted editorial execution state
  const rawFindings = useMemo(() => metadata?.audit?.findings || [], [metadata]);
  const parsedChapters = useMemo(() => parseBookChapters(bookContent), [bookContent]);
  const clusteredTasks = useMemo(() => {
    return clusterEditorialFindings(rawFindings, parsedChapters, metadata?.dossier);
  }, [rawFindings, parsedChapters, metadata?.dossier]);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [fixedTaskIds, setFixedTaskIds] = useState<Set<string>>(new Set());
  const [taskExplanations, setTaskExplanations] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'clean' | 'changes'>('clean');
  const [lastDiff, setLastDiff] = useState<{ before: string; after: string } | null>(null);
  const [localRunning, setLocalRunning] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const activeTaskRef = React.useRef<HTMLLIElement | null>(null);

  // Author model detection: use the model that wrote this manuscript (e.g. DeepSeek v4.1 flash)
  const [editorialModel, setEditorialModel] = useState<any>(() => {
    if (metadata?.models) {
      if (typeof metadata.models === 'string') {
        const parsed = parseModelConfigFromTag(metadata.models);
        if (parsed) return parsed;
      } else if (typeof metadata.models === 'object' && metadata.models.author) {
        return metadata.models.author;
      }
    }
    const valCfg = getStoredValidatorConfig();
    if (valCfg && (valCfg as any).enabled !== false) return valCfg;
    return getStoredProviderConfig();
  });

  useEffect(() => {
    // If not already resolved from metadata, check the project run_log to pick up the author's original model (e.g. DeepSeek)
    fetch('/api/project-autosave')
      .then(res => res.json())
      .then(data => {
        const runLog = data?.snapshot?.files?.run_log;
        if (Array.isArray(runLog)) {
          const modelEntry = runLog.find((e: any) => e.stage === 'models');
          if (modelEntry?.detail) {
            const parsed = parseModelConfigFromTag(modelEntry.detail);
            if (parsed) {
              setEditorialModel(parsed);
            }
          }
        }
      })
      .catch(() => {});
  }, [metadataJson]);

  useEffect(() => {
    if (activeTaskId !== null && activeTaskRef.current) {
      activeTaskRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeTaskId]);

  useEffect(() => {
    if (!isEditing) {
      setEditableContent(manuscriptWithTitle);
    }
  }, [manuscriptWithTitle, isEditing]);

  const handleSave = () => {
    const success = onManualSave?.(editableContent);
    if (success !== false) {
      setIsEditing(false);
      setSaveError(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setSaveError('Could not save manuscript chapters.');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditableContent(manuscriptWithTitle);
    setSaveError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const isRunning = isEditorialRunning || localRunning;
  const currentStatus = localStatus || editorialStatus;

  const handleApplyReview = async () => {
    if (clusteredTasks.length === 0) {
      if (rawFindings.length === 0) {
        onEdit?.();
        return;
      }
    }

    // Use the author model that wrote the manuscript (e.g. DeepSeek v4.1 flash)
    const modelConfig = editorialModel;

    setLocalRunning(true);
    setFixedTaskIds(new Set());
    setTaskExplanations({});

    let currentManuscript = bookContent;

    try {
      // Top-to-bottom processing across prioritized tasks
      for (let i = 0; i < clusteredTasks.length; i++) {
        const task = clusteredTasks[i];
        setActiveTaskId(task.id);
        setLocalStatus(`Task ${i + 1}/${clusteredTasks.length}: ${task.title}…`);

        const result = await repairSurgicalTask(
          task,
          currentManuscript,
          displayTitle,
          async (prompt, system) => {
            return await generateText(
              prompt,
              system,
              undefined,
              0.2,
              undefined,
              undefined,
              modelConfig,
              4000,
              true
            );
          }
        );

        if (result.changed) {
          const beforeText = currentManuscript;
          currentManuscript = result.updatedManuscript;
          onManualSave?.(result.updatedManuscript);
          setEditableContent(result.updatedManuscript);
          setLastDiff({ before: beforeText, after: result.updatedManuscript });
          setViewMode('changes');
          setFixedTaskIds(prev => new Set(prev).add(task.id));
          setTaskExplanations(prev => ({
            ...prev,
            [task.id]: result.explanation || 'Targeted edit applied',
          }));
        } else {
          setFixedTaskIds(prev => new Set(prev).add(task.id));
          setTaskExplanations(prev => ({
            ...prev,
            [task.id]: result.explanation || 'Verified: compliant with canon (no edit needed)',
          }));
        }

        // Pacing delay so author can visually follow the active item highlighted and text changes
        await new Promise(r => setTimeout(r, 600));
      }

      setLocalStatus('All editorial tasks applied.');
      setTimeout(() => setLocalStatus(null), 4000);
    } catch (err: any) {
      console.error('Targeted review failed:', err);
      setLocalStatus(`Error: ${err?.message || 'Failed to apply review'}`);
      setTimeout(() => setLocalStatus(null), 5000);
    } finally {
      setActiveTaskId(null);
      setLocalRunning(false);
    }
  };  const [undoStack, setUndoStack] = useState<UndoStackEntry[]>([]);

  const handleApplyStudioPatch = (newContent: string, targetChapter?: number, patchSnippet?: string) => {
    setUndoStack(prev => pushUndoState(prev, bookContent, patchSnippet || 'Editorial patch', targetChapter));
    setLastDiff({ before: bookContent, after: newContent });
    setEditableContent(newContent);
    onManualSave?.(newContent);
    setViewMode('changes');
  };

  const handleUndoStudioPatch = () => {
    const popResult = popUndoState(undoStack);
    if (popResult) {
      const restored = popResult.previous.manuscript;
      setUndoStack(popResult.updatedStack);
      setLastDiff({ before: bookContent, after: restored });
      setEditableContent(restored);
      onManualSave?.(restored);
      setViewMode('changes');
    }
  };

  return (
    <div className="space-y-4">
      <BookStatistics bookContent={bookContent} metadata={metadata} />

      {/* Three-zone layout: Column 1 (33% Review), Column 2 (47% Manuscript), Column 3 (1fr Cover) */}
      <div className="grid grid-cols-1 lg:grid-cols-[33%_47%_1fr] gap-6 items-start">
        {/* Column 1 (~33%): Interactive Editorial Assistant Studio */}
        <EditorialChatStudio
          bookContent={bookContent}
          metadata={metadata}
          onApplyPatch={handleApplyStudioPatch}
          onUndoPatch={handleUndoStudioPatch}
          canUndo={undoStack.length > 0}
          activeModelConfig={editorialModel}
          displayTitle={displayTitle}
          isEditorialRunning={isRunning}
        />

        {/* Column 2 (~35%): Manuscript Reader Card */}
        <div className="border border-zinc-800 rounded bg-zinc-900/40 overflow-hidden text-left flex flex-col h-[calc(100vh-280px)] min-h-[460px]">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
            <h2 className="text-sm font-medium text-zinc-200">Manuscript</h2>

            <div className="flex items-center gap-2">
              {lastDiff && !isEditing && (
                <div className="flex items-center bg-zinc-950 p-0.5 rounded border border-zinc-800 text-xs mr-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('clean')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      viewMode === 'clean'
                        ? 'bg-zinc-800 text-zinc-100 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Clean text
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('changes')}
                    className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                      viewMode === 'changes'
                        ? 'bg-zinc-800 text-zinc-100 font-medium border border-zinc-700'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>Changes</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                  </button>
                </div>
              )}
              {saveSuccess && !isEditing && (
                <span className="text-xs text-zinc-400 font-medium">Saved ✓</span>
              )}
              {onManualSave && !isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditableContent(manuscriptWithTitle);
                    setIsEditing(true);
                    setSaveError(null);
                  }}
                  className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
                >
                  Edit text
                </button>
              )}
              {isEditing && (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex items-center h-6 px-2.5 text-xs font-semibold whitespace-nowrap shrink-0 bg-zinc-200 hover:bg-zinc-100 text-zinc-900 rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => handleCopyToClipboard(manuscriptWithTitle)}
                className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
              >
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
            {saveError && (
              <p className="text-xs text-red-400 mb-3">{saveError}</p>
            )}
            {isEditing ? (
              <div>
                <textarea
                  value={editableContent}
                  onChange={(e) => setEditableContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Edit manuscript"
                  className="w-full min-h-[calc(100vh-400px)] p-4 bg-zinc-950 border border-zinc-800 rounded font-serif text-prose text-zinc-200 focus:outline-none focus:border-zinc-700 resize-y leading-relaxed"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-zinc-500">
                    Tip: press <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded border border-zinc-800 text-zinc-400 text-[11px]">Cmd+S</kbd> or <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded border border-zinc-800 text-zinc-400 text-[11px]">Ctrl+S</kbd> to save
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                       type="button"
                      onClick={handleSave}
                      className="inline-flex items-center h-7 px-3 text-xs font-semibold whitespace-nowrap bg-zinc-200 hover:bg-zinc-100 text-zinc-900 rounded transition-colors"
                    >
                      Save changes
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="inline-flex items-center h-7 px-3 text-xs font-medium whitespace-nowrap bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : viewMode === 'changes' && lastDiff ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs px-3 py-1.5 bg-zinc-950/70 border border-zinc-800 rounded text-zinc-400">
                  <span>
                    Revision changes: <span className="font-mono text-zinc-200">+added</span> · <span className="font-mono text-zinc-500 line-through">-removed</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMode('clean')}
                    className="text-zinc-400 hover:text-zinc-200 underline"
                  >
                    Hide diff
                  </button>
                </div>
                <MarkdownChangesView before={lastDiff.before} after={lastDiff.after} />
              </div>
            ) : (
              <MarkdownView
                content={manuscriptWithTitle}
                className="font-serif text-prose break-words max-w-[62ch] mx-auto text-zinc-200"
              />
            )}
          </div>
        </div>

        {/* Column 3 (~20%): Book Cover & Imprint */}
        <div className="flex flex-col">
          <BookCoverUpload
            title={displayTitle}
            genre={metadata?.genre}
            author={currentAuthor}
            onAuthorChange={handleAuthorChange}
            imprint={imprint}
            onImprintChange={onImprintChange}
            coverImage={coverImage}
            onCoverChange={onCoverChange}
          />
        </div>
      </div>
    </div>
  );
};

export default BookDisplay;
