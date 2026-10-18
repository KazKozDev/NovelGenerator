import React, { useState, useMemo, useEffect, useRef } from 'react';
import BookStatistics from './BookStatistics';

import { extractBookTitle } from '../utils/exportUtils';
import { MarkdownView } from './common/MarkdownView';
import MarkdownChangesView from './MarkdownChangesView';
import BookCoverUpload, { ImprintData } from './BookCoverUpload';
import { parseModelConfigFromTag } from '../utils/novel/targetedEditorial';
import { getStoredProviderConfig, getStoredValidatorConfig } from '../services/llmService';
import EditorialChatStudio from './EditorialChatStudio';
import { pushUndoState, popUndoState, UndoStackEntry } from '../utils/novel/patchApplier';
import { parseBookChapters } from '../utils/novel/manuscript';
import { useWorkspaceEntry } from '../utils/workspaceState';

/** `session` ties autosaves of one manual editing session into one revision; `quiet` keeps a failed autosave out of the error banner. */
export interface ManualSaveOptions { session?: string; quiet?: boolean }

/** A manual edit autosaves only while every chapter it started with is still there, in order and with text. */
export function safeToAutosave(start: string, content: string): boolean {
  const before = parseBookChapters(start).map(c => c.num);
  const now = parseBookChapters(content);
  return now.length > 0 && now.length === before.length && now.every((c, i) => c.num === before[i] && !!c.content.trim());
}

interface BookDisplayProps {
  bookContent: string;
  metadataJson: string;
  onReset: () => void;
  onEdit?: () => void;
  isEditorialRunning?: boolean;
  editorialStatus?: string;
  onEditingStateChange?: (editing: boolean) => void;
  onManualSave?: (newContent: string, options?: ManualSaveOptions) => boolean;
  /** The book folder the workspace state goes to; the manuscript's own title when not given. */
  bookTitle?: string;
  author?: string;
  onAuthorChange?: (author: string) => void;
  imprint?: ImprintData;
  onImprintChange?: (imprint: ImprintData) => void;
  coverImage?: string | null;
  onCoverChange?: (coverUrl: string | null) => void;
  onExportProject?: () => void;
  /** The cover and edition column; off where the Cover and Publish stages hold them. */
  showPublicationColumn?: boolean;
}

const BookDisplay: React.FC<BookDisplayProps> = ({
  bookContent,
  metadataJson,
  onReset,
  onEdit,
  isEditorialRunning,
  editorialStatus,
  onManualSave,
  onEditingStateChange,
  bookTitle,
  author,
  onAuthorChange,
  imprint,
  onImprintChange,
  coverImage,
  onCoverChange,
  onExportProject,
  showPublicationColumn = true,
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
  useEffect(()=>{onEditingStateChange?.(isEditing);return()=>onEditingStateChange?.(false);},[isEditing,onEditingStateChange]);
  const [editableContent, setEditableContent] = useState(manuscriptWithTitle);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // A manual edit autosaves a second after typing stops, so text is never lost without Save. Cancel goes back
  // to the text the edit started from.
  const editStart = useRef('');
  const lastAutosaved = useRef('');
  const editSession = useRef('');
  const [autosaveNote, setAutosaveNote] = useState<'' | 'saved' | 'held'>('');
  const startEditing = () => {
    editStart.current = manuscriptWithTitle;
    lastAutosaved.current = manuscriptWithTitle;
    editSession.current = `edit-${Date.now()}`;
    setAutosaveNote('');
    setEditableContent(manuscriptWithTitle);
    setIsEditing(true);
    setSaveError(null);
  };
  useEffect(() => {
    if (!isEditing || !onManualSave || editableContent === lastAutosaved.current) return;
    const timer = setTimeout(() => {
      if (!safeToAutosave(editStart.current, editableContent)) { setAutosaveNote('held'); return; }
      if (onManualSave(editableContent, { session: editSession.current, quiet: true }) === false) { setAutosaveNote('held'); return; }
      lastAutosaved.current = editableContent;
      setAutosaveNote('saved');
    }, 1000);
    return () => clearTimeout(timer);
  }, [isEditing, editableContent, onManualSave]);

  const [viewMode, setViewMode] = useState<'clean' | 'changes'>('clean');
  const [lastDiff, setLastDiff] = useState<{ before: string; after: string } | null>(null);
  const readerContainerRef = React.useRef<HTMLDivElement | null>(null);

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
    if (!isEditing) {
      setEditableContent(manuscriptWithTitle);
    }
  }, [manuscriptWithTitle, isEditing]);

  const handleSave = () => {
    const success = onManualSave?.(editableContent, { session: editSession.current });
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
    if (lastAutosaved.current !== editStart.current && onManualSave?.(editStart.current, { session: editSession.current }) === false) {
      setSaveError('Could not go back to the text before this edit; the autosaved edit stays.');
      return;
    }
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

  const isRunning = isEditorialRunning;
  const currentStatus = editorialStatus;
  // The undo history of applied editorial patches survives a reload, in the book's workspace state.
  const workspaceTitle = bookTitle || displayTitle;
  const [savedUndo, saveUndo] = useWorkspaceEntry<UndoStackEntry[]>(workspaceTitle, 'undo');
  const undoStack = savedUndo || [];
  const setUndoStack = (next: UndoStackEntry[] | ((prev: UndoStackEntry[]) => UndoStackEntry[])) => {
    const value = typeof next === 'function' ? next(undoStack) : next;
    saveUndo(value.length ? value : undefined);
  };

  const scrollToRevisionTarget = (targetSnippet?: string) => {
    setViewMode('changes');
    setTimeout(() => {
      const scroller = readerContainerRef.current;
      if (!scroller) return;

      if (targetSnippet) {
        const elements = scroller.querySelectorAll<HTMLElement>('.revision-added, .revision-removed');
        for (const el of Array.from(elements)) {
          const text = el.textContent || '';
          const snippetPrefix = targetSnippet.slice(0, 25);
          if (text.includes(snippetPrefix) || targetSnippet.includes(text.slice(0, 25))) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }
        }
      }

      const firstTarget = scroller.querySelector<HTMLElement>('.revision-added, .revision-removed');
      if (firstTarget) {
        firstTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
  };

  const handleApplyStudioPatch = (newContent: string, targetChapter?: number, patchSnippet?: string) => {
    if (!onManualSave || onManualSave(newContent) === false) return false;
    setUndoStack(prev => pushUndoState(prev, bookContent, patchSnippet || 'Editorial patch', targetChapter));
    setLastDiff({ before: bookContent, after: newContent });
    setEditableContent(newContent);
    scrollToRevisionTarget(patchSnippet);
    return true;
  };

  const handleUndoStudioPatch = () => {
    const popResult = popUndoState(undoStack);
    if (popResult) {
      const restored = popResult.previous.manuscript;
      if (!onManualSave || onManualSave(restored) === false) {
        setSaveError("Could not restore manuscript changes.");
        return;
      }
      setUndoStack(popResult.updatedStack);
      setLastDiff({ before: bookContent, after: restored });
      setEditableContent(restored);
      scrollToRevisionTarget(popResult.previous.description);
    }
  };

  return (
    <div className="space-y-4">
      <BookStatistics bookContent={bookContent} metadata={metadata} />

      {/* Column 1 (Review), Column 2 (Manuscript), and Column 3 (Cover) where no Cover or Publish stage holds it */}
      <div className={`grid grid-cols-1 gap-6 items-stretch ${showPublicationColumn ? 'lg:grid-cols-[33%_47%_1fr]' : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'}`}>
        {/* Column 1 (~33%): Interactive Editorial Assistant Studio */}
        <EditorialChatStudio
          className="h-[calc(100vh-215px)] min-h-[520px]"
          bookContent={isEditing ? editableContent : bookContent}
          metadata={metadata}
          onApplyPatch={handleApplyStudioPatch}
          onUndoPatch={handleUndoStudioPatch}
          canUndo={undoStack.length > 0}
          activeModelConfig={editorialModel}
          onModelChange={setEditorialModel}
          displayTitle={displayTitle}
          bookTitle={workspaceTitle}
          isEditorialRunning={isRunning || isEditing}
          editorialStatus={isEditing?'Manual editing — save or cancel manuscript changes.':currentStatus}
          onScrollToRevision={scrollToRevisionTarget}
        />

        {/* Column 2 (~47%): Manuscript Reader Card */}
        <div className="border border-zinc-800 rounded bg-zinc-900/40 overflow-hidden text-left flex flex-col h-[calc(100vh-215px)] min-h-[520px]">
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
                  onClick={startEditing}
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

          <div ref={readerContainerRef} className="p-6 sm:p-8 flex-1 overflow-y-auto scroll-smooth">
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
                    {autosaveNote === 'held'
                      ? 'Not autosaved yet: keep every numbered chapter heading, in order, with text.'
                      : autosaveNote === 'saved'
                        ? 'Autosaved. Cancel goes back to the text before this edit.'
                        : 'Changes autosave as you type. Cancel goes back to the text before this edit.'}
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
        {showPublicationColumn && <div className="flex flex-col h-[calc(100vh-215px)] min-h-[520px]">
          <BookCoverUpload
            className="h-full"
            title={displayTitle}
            genre={metadata?.genre}
            author={currentAuthor}
            onAuthorChange={handleAuthorChange}
            imprint={imprint}
            onImprintChange={onImprintChange}
            coverImage={coverImage}
            onCoverChange={onCoverChange}
          />
        </div>}
      </div>
    </div>
  );
};

export default BookDisplay;
