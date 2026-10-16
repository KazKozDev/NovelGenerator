import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  clusterEditorialFindings,
  repairSurgicalTask,
  formatModelDisplayLabel,
  ClusteredEditorialTask,
} from '../utils/novel/targetedEditorial';
import { parseBookChapters } from '../utils/novel/manuscript';
import { generateText } from '../services/llmService';
import { applySearchReplacePatch } from '../utils/novel/patchApplier';
import { runEditorialTurn, ProposedDiffCard } from '../utils/novel/editorialAgent';
import { withOllamaOutputRoom } from '../utils/novel/v2/llm';
import { MarkdownView } from './common/MarkdownView';

export interface EditorialChatStudioProps {
  bookContent: string;
  metadata: any;
  onApplyPatch: (newManuscript: string, targetChapter?: number, patchSnippet?: string) => boolean | void;
  onUndoPatch: () => void;
  canUndo: boolean;
  activeModelConfig?: any;
  displayTitle?: string;
  isEditorialRunning?: boolean;
  editorialStatus?: string;
  onScrollToRevision?: (targetText?: string) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools?: { tool: string; summary: string }[];
  diffCards?: ProposedDiffCard[];
  timestamp: number;
}

const QUICK_PROMPTS = [
  'Check props & invariants',
  'Find oxygen timers',
  'Review Chapter 1',
];

export const EditorialChatStudio: React.FC<EditorialChatStudioProps> = ({
  bookContent,
  metadata,
  onApplyPatch,
  onUndoPatch,
  canUndo,
  activeModelConfig,
  displayTitle = 'Manuscript Draft',
  isEditorialRunning = false,
  editorialStatus,
  onScrollToRevision,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [appliedCardIds, setAppliedCardIds] = useState<Set<string>>(new Set());
  const [rejectedCardIds, setRejectedCardIds] = useState<Set<string>>(new Set());
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [systemAccordionOpen, setSystemAccordionOpen] = useState(true);
  const [activeSystemTaskId, setActiveSystemTaskId] = useState<string | null>(null);
  const [systemTaskStatus, setSystemTaskStatus] = useState<Record<string, 'pending' | 'working' | 'done'>>({});

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const rawFindings = useMemo(() => metadata?.audit?.findings || [], [metadata]);
  const parsedChapters = useMemo(() => parseBookChapters(bookContent), [bookContent]);
  const clusteredTasks = useMemo(() => {
    return clusterEditorialFindings(rawFindings, parsedChapters, metadata?.dossier);
  }, [rawFindings, parsedChapters, metadata?.dossier]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  const handleSendMessage = async (userText: string) => {
    const text = userText.trim();
    if (!text || isRunning) return;

    const userMsgId = `msg_${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: 'user', text, timestamp: Date.now() },
    ];
    setMessages(newMessages);
    setInput('');
    setIsRunning(true);

    try {
      const history = newMessages.map(m => ({ role: m.role, content: m.text }));

      const response = await runEditorialTurn({
        userPrompt: text,
        bookContent,
        metadata,
        history,
        provider: activeModelConfig?.provider,
        callModel: async (prompt, system) => {
          return await withOllamaOutputRoom(
            async (maxTokens) => {
              return await generateText(
                prompt,
                system,
                undefined,
                0.2,
                undefined,
                undefined,
                activeModelConfig,
                maxTokens,
                false
              );
            },
            8192,
            8192
          );
        },
      });

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        text: response.assistantMessage,
        tools: response.executedTools,
        diffCards: response.diffCards,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Editorial turn failed:', err);
      setMessages(prev => [
        ...prev,
        {
          id: `msg_err_${Date.now()}`,
          role: 'assistant',
          text: `Error: ${err?.message || 'Failed to complete editorial command.'}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleApplyDiffCard = (card: ProposedDiffCard) => {
    const patchResult = applySearchReplacePatch(
      bookContent,
      card.chapterNum,
      card.searchTarget,
      card.replacementText,
      card.startBlockId,
      card.endBlockId
    );

    if (patchResult.success) {
      onApplyPatch(
        patchResult.updatedManuscript,
        patchResult.matchedChapter || card.chapterNum,
        card.replacementText
      );
      setAppliedCardIds(prev => new Set(prev).add(card.id));
      setCardErrors(prev => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });
    } else {
      setCardErrors(prev => ({
        ...prev,
        [card.id]: patchResult.error || 'Text match failed in chapter.',
      }));
    }
  };

  const handleRejectDiffCard = (cardId: string) => {
    setRejectedCardIds(prev => new Set(prev).add(cardId));
  };

  const handleApplySingleSystemTask = async (task: ClusteredEditorialTask) => {
    setActiveSystemTaskId(task.id);
    setSystemTaskStatus(prev => ({ ...prev, [task.id]: 'working' }));

    try {
      const result = await repairSurgicalTask(
        task,
        bookContent,
        displayTitle,
        async (prompt, system) => {
          return await generateText(
            prompt,
            system,
            undefined,
            0.2,
            undefined,
            undefined,
            activeModelConfig,
            4000,
            true
          );
        }
      );

      if (result.changed) {
        onApplyPatch(result.updatedManuscript, task.chapterNumber, result.explanation);
        setSystemTaskStatus(prev => ({ ...prev, [task.id]: 'done' }));
      } else {
        setSystemTaskStatus(prev => ({ ...prev, [task.id]: 'done' }));
      }
    } catch (err) {
      console.error('System task repair failed:', err);
    } finally {
      setActiveSystemTaskId(null);
    }
  };

  const handleApplyAllSystemTasks = async () => {
    if (clusteredTasks.length === 0 || isRunning) return;
    setIsRunning(true);
    let currentText = bookContent;

    for (let i = 0; i < clusteredTasks.length; i++) {
      const task = clusteredTasks[i];
      setActiveSystemTaskId(task.id);
      setSystemTaskStatus(prev => ({ ...prev, [task.id]: 'working' }));

      try {
        const result = await repairSurgicalTask(
          task,
          currentText,
          displayTitle,
          async (prompt, system) => {
            return await generateText(
              prompt,
              system,
              undefined,
              0.2,
              undefined,
              undefined,
              activeModelConfig,
              4000,
              true
            );
          }
        );

        if (result.changed) {
          currentText = result.updatedManuscript;
          onApplyPatch(result.updatedManuscript, task.chapterNumber, result.explanation);
        }
        setSystemTaskStatus(prev => ({ ...prev, [task.id]: 'done' }));
        await new Promise(r => setTimeout(r, 400));
      } catch (err) {
        console.error(`Task ${task.id} failed:`, err);
      }
    }

    setActiveSystemTaskId(null);
    setIsRunning(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  const activeRunning = isRunning || isEditorialRunning;

  return (
    <section
      className="border border-zinc-800 rounded bg-zinc-900/40 overflow-hidden text-left flex flex-col h-[calc(100vh-280px)] min-h-[460px]"
      aria-label="Editorial assistant studio"
    >
      {/* 1. Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-zinc-200">Editorial Review · Assistant</h2>
          <span
            className="text-[11px] font-mono text-zinc-300 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 inline-flex items-center gap-1.5"
            title={`Editorial model: ${formatModelDisplayLabel(activeModelConfig)}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
            <span>{formatModelDisplayLabel(activeModelConfig)}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {canUndo && (
            <button
              type="button"
              onClick={onUndoPatch}
              disabled={activeRunning}
              className="inline-flex items-center h-6 px-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded transition-colors"
              title="Undo last applied patch"
            >
              ⤺ Undo
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear chat
            </button>
          )}
        </div>
      </div>

      {/* 2. Message Feed with Embedded System Audit Accordion */}
      <div className="p-4 space-y-4 flex-1 overflow-y-auto text-xs">
        {/* System Editorial Audit Accordion Card */}
        {(clusteredTasks.length > 0 || rawFindings.length > 0) && (
          <div className="border border-zinc-800/80 rounded bg-zinc-950/60 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/50 border-b border-zinc-800/60">
              <button
                type="button"
                onClick={() => setSystemAccordionOpen(prev => !prev)}
                className="flex items-center gap-2 text-left font-medium text-zinc-200 hover:text-zinc-100 select-none"
              >
                <span>{systemAccordionOpen ? '▼' : '▶'}</span>
                <span>System Editorial Tasks ({clusteredTasks.length || rawFindings.length} {clusteredTasks.length ? 'tasks' : 'findings'})</span>
              </button>
              <button
                type="button"
                onClick={handleApplyAllSystemTasks}
                disabled={activeRunning}
                className="inline-flex items-center h-5 px-2 text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700/60 rounded transition-colors"
              >
                {activeRunning ? (editorialStatus || 'Applying Review…') : 'Apply Review'}
              </button>
            </div>

            {systemAccordionOpen && (
              <div className="p-3 space-y-2 max-h-56 overflow-y-auto">
                {clusteredTasks.length > 0 ? (
                  clusteredTasks.map(task => {
                    const status = systemTaskStatus[task.id] || 'pending';
                    const isCurrent = activeSystemTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        className="p-2 rounded bg-zinc-900/60 border border-zinc-800/60 flex items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-zinc-800 text-zinc-400">
                              Ch. {task.chapterNumber}
                            </span>
                            <span className="text-zinc-200 font-medium truncate">{task.title}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 line-clamp-1">{task.problemSummary}</p>
                        </div>

                        <div className="shrink-0 flex items-center gap-1">
                          {status === 'done' ? (
                            <span className="text-[11px] text-zinc-400">✓ Done</span>
                          ) : isCurrent ? (
                            <span className="text-[11px] text-zinc-300 animate-pulse">Working…</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleApplySingleSystemTask(task)}
                              disabled={activeRunning}
                              className="h-5 px-2 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
                            >
                              Apply
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  rawFindings.map((finding: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-zinc-900/60 border border-zinc-800/60 flex items-start justify-between gap-2"
                    >
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {finding.severity && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-zinc-800 text-zinc-400">
                              {finding.severity}
                            </span>
                          )}
                          <span className="text-zinc-200 font-medium truncate">
                            {finding.description || finding.finding || 'Audit Finding'}
                          </span>
                        </div>
                        {finding.evidence_refs && (
                          <p className="text-[11px] text-zinc-400 line-clamp-1">
                            {Array.isArray(finding.evidence_refs) ? finding.evidence_refs.join(', ') : finding.evidence_refs}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Chat message bubbles */}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1`}
          >
            <div
              className={`max-w-[90%] p-3 rounded-lg leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-zinc-800 text-zinc-100 rounded-br-none border border-zinc-700/60'
                  : 'bg-zinc-950/70 text-zinc-300 rounded-bl-none border border-zinc-800'
              }`}
            >
              {/* Tool Execution Badges */}
              {msg.tools && msg.tools.length > 0 && (
                <div className="space-y-1 mb-2">
                  {msg.tools.map((t, i) => (
                    <div
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 mr-1.5 mb-1"
                    >
                      <span>{t.tool.includes('search') ? '🔍' : t.tool.includes('diff') ? '✏️' : '⚠️'}</span>
                      <span>{t.summary}</span>
                    </div>
                  ))}
                </div>
              )}

              <MarkdownView content={msg.text} className="text-xs text-inherit break-words space-y-1.5" />
            </div>

            {/* Diff Review Cards */}
            {msg.diffCards && msg.diffCards.length > 0 && (
              <div className="space-y-2.5 w-full mt-2">
                {msg.diffCards.map(card => {
                  const isApplied = appliedCardIds.has(card.id);
                  const isRejected = rejectedCardIds.has(card.id);

                  if (isRejected) {
                    return (
                      <div
                        key={card.id}
                        className="p-2 rounded border border-zinc-800 bg-zinc-950/40 text-[11px] text-zinc-500 italic"
                      >
                        Patch for Chapter {card.chapterNum} was rejected.
                      </div>
                    );
                  }

                  return (
                    <div
                      key={card.id}
                      className={`p-3 rounded-md border text-left space-y-2 transition-all ${
                        isApplied
                          ? 'border-zinc-700 bg-zinc-900/60'
                          : 'border-zinc-800 bg-zinc-950/90'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-1.5">
                        <span className="font-medium text-zinc-200">
                          {card.replacementText === '' ? 'Excision' : 'Proposed Edit'} · Chapter {card.chapterNum}
                          {card.startBlockId && (
                            <span className="ml-1 text-[10px] font-mono text-zinc-400">
                              ({card.startBlockId}{card.endBlockId && card.endBlockId !== card.startBlockId ? `–${card.endBlockId}` : ''})
                            </span>
                          )}
                        </span>
                        {isApplied && (
                          <button
                            type="button"
                            onClick={() => onScrollToRevision?.(card.replacementText || card.searchTarget.slice(0, 40))}
                            className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Click to view change in manuscript"
                          >
                            <span>✓ Applied</span>
                            <span className="text-[9px] underline opacity-80">(show in text)</span>
                          </button>
                        )}
                      </div>

                      {/* Red / Green visual diff */}
                      <div className="space-y-1 font-mono text-[11px] bg-zinc-900/80 p-2 rounded border border-zinc-800/60 overflow-x-auto">
                        <div className="text-red-400/90 line-through break-words">
                          - {card.searchTarget}
                        </div>
                        {card.replacementText ? (
                          <div className="text-emerald-400 break-words">
                            + {card.replacementText}
                          </div>
                        ) : (
                          <div className="text-zinc-500 italic text-[10px]">
                            (Block deleted / excised)
                          </div>
                        )}
                      </div>

                      {card.rationale && (
                        <p className="text-[11px] text-zinc-400">
                          <span className="text-zinc-500">Rationale:</span> {card.rationale}
                        </p>
                      )}

                      {/* Warnings if entity graph caught cross-text implications */}
                      {card.warnings && card.warnings.length > 0 && (
                        <div className="p-1.5 rounded bg-zinc-900 border border-zinc-700/60 text-[11px] text-zinc-300 space-y-1">
                          {card.warnings.map((w, wIdx) => (
                            <div key={wIdx} className="flex items-start gap-1">
                              <span>⚠️</span>
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {!isApplied && (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleApplyDiffCard(card)}
                              className="h-6 px-2.5 text-xs font-semibold bg-zinc-200 hover:bg-zinc-100 text-zinc-900 rounded transition-colors"
                            >
                              Apply Patch
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectDiffCard(card.id)}
                              className="h-6 px-2.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                          {cardErrors[card.id] && (
                            <div className="p-2 rounded bg-red-950/40 border border-red-900/60 text-[11px] text-red-300 flex items-start gap-1.5">
                              <span>⚠️</span>
                              <span>{cardErrors[card.id]}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {activeRunning && (
          <div className="flex items-center gap-2 text-zinc-400 text-xs py-2 italic">
            <span className="inline-block animate-spin">↻</span>
            <span>{editorialStatus || 'Editorial assistant is analyzing manuscript…'}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. Bottom Chat Input & Quick Chips */}
      <div className="p-3 border-t border-zinc-800 bg-zinc-900/70 shrink-0 space-y-2">
        {/* Quick prompt chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {QUICK_PROMPTS.map((promptText, idx) => (
            <button
              key={idx}
              type="button"
              disabled={activeRunning}
              onClick={() => handleSendMessage(promptText)}
              className="h-5 px-2 text-[10px] whitespace-nowrap bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded transition-colors disabled:opacity-50"
            >
              {promptText}
            </button>
          ))}
        </div>

        {/* Text input area */}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={activeRunning}
            placeholder="Ask editor (e.g. 'Replace tile with limestone in Ch. 3' · Cmd+Enter to send)"
            rows={2}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 resize-none leading-relaxed placeholder:text-zinc-600 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => handleSendMessage(input)}
            disabled={activeRunning || !input.trim()}
            className="h-8 px-3 text-xs font-semibold bg-zinc-200 hover:bg-zinc-100 disabled:opacity-50 text-zinc-900 rounded transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
};

export default EditorialChatStudio;
