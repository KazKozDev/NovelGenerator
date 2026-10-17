import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  clusterEditorialFindings,
  reconcileEditorialFindings,

  formatModelDisplayLabel,
  ClusteredEditorialTask,
} from '../utils/novel/targetedEditorial';
import { reportEditorialFindings, checkEditorialTask, proposeEditorialTask, taskContext, type TaskStatus, type TaskProposal } from '../utils/novel/editorialTasks';
import { parseBookChapters } from '../utils/novel/manuscript';
import { generateText } from '../services/llmService';
import { applySearchReplacePatch } from '../utils/novel/patchApplier';
import { runEditorialTurn, buildCloseProblemPrompt, ProposedDiffCard, type EditorialProblem } from '../utils/novel/editorialAgent';
import { withOllamaOutputRoom } from '../utils/novel/v2/llm';
import { MarkdownView } from './common/MarkdownView';
import EditorialModelModal from './EditorialModelModal';

export interface EditorialChatStudioProps {
  bookContent: string;
  callModel?: (prompt: string, system: string) => Promise<string>;
  metadata: any;
  onApplyPatch: (newManuscript: string, targetChapter?: number, patchSnippet?: string) => boolean | void;
  onUndoPatch: () => void;
  canUndo: boolean;
  activeModelConfig?: any;
  onModelChange?: (config: any) => void;
  displayTitle?: string;
  isEditorialRunning?: boolean;
  editorialStatus?: string;
  onScrollToRevision?: (targetText?: string) => void;
  className?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools?: { tool: string; summary: string }[];
  diffCards?: ProposedDiffCard[];
  problems?: EditorialProblem[];
  timestamp: number;
}

interface QuickEditorialPrompt {
  label: string;
  prompt: string;
  /** 'skeletons': the agent sees chapter skeletons instead of prose and reads passages through tools. */
  view?: 'full' | 'skeletons';
}

// Review buttons: they ask for findings with quotes, not changes; the author picks what to work on next.
export const QUICK_PROMPTS: QuickEditorialPrompt[] = [
  {
    label: '01 · Plot holes',
    view: 'skeletons',
    prompt: `Check the whole book for plot holes. Do not change the text yet.
Code has already checked the chapter records and lists its suspicions below, each with its passages. Decide each from the passages given; do not read whole chapters. Keep it only if the passages show it; a character's lie or mistake, a move between rooms, a scene remembered on purpose, or a time the book leaves unstated is not a hole.
You may add up to 3 suspicions of your own: two different spans of time for one relation or habit in the spans list, a NOT line in the knowledge by pair after the same character already knew it, a character who acts on a fact before learning it, or the book contradicting the author's notes. Code's suspicions already come with their passages: do not send them to check_suspects again. Use at most one check_suspects call, for your own suspicions only. Keep only suspicions that were checked: code's, or your own sent through check_suspects; a new problem noticed while writing goes through check_suspects first.
For each kept problem give the quotes with paragraph ids and one or two ways the author could close it, then one block:
\`\`\`problem
{"title": "short name of the problem", "places": ["ch4_p18", "ch6_p1"], "ways": ["first way to close it", "second way"]}
\`\`\`
Drop a suspect only with a quote that clears it: a sentence from the book that explains it, resolves it, or shows it is meant, or a sentence from the author's notes that shows it is intended (a planned lie or secret). Your reading of the context ("in this context", "it could mean") is not a reason; a suspect with no such quote stays kept. For each dropped suspect write one line, then one block:
\`\`\`dropped
{"title": "short name of the suspect", "places": ["ch1_p21"], "quote": "the exact sentence from the book or the author's notes that clears it"}
\`\`\`
End with the kept problems ranked by how much they break the story, and ask which ones to work on. Answer in the language of the manuscript.`,
  },
  {
    label: '02 · Repeats',
    prompt: `Find what the book tells twice. Do not change the text yet.
Call find_repeats {}, then read each repeated passage in its place (read_blocks). For each one, say whether it is a scene pasted twice, a scene retold with the same facts, or a refrain the author likely meant, and why.
Also look for events the reader is told twice in different words: the same discovery, the same explanation, the same confession.
Give paragraph ids for both places and say which one the story needs. If nothing is told twice, say so. Answer in the language of the manuscript.`,
  },
  {
    label: '03 · Pacing',
    prompt: `Check whether the story moves. Do not change the text yet.
Start with chapter_skeleton {} for every chapter. For each scene say in one line what is different at its end, and whether it follows from the scene before because of it, despite it, or only after it.
Name the stretches where nothing changes for a whole chapter or longer, the questions the book raises and never answers, and the promises made early that the ending does not keep.
Read the passages (read_blocks) before you call a scene idle. Give paragraph ids. If the story moves well, say so. Answer in the language of the manuscript.`,
  },
];

export const EditorialChatStudio: React.FC<EditorialChatStudioProps> = ({
  bookContent,
  callModel,
  metadata,
  onApplyPatch,
  onUndoPatch,
  canUndo,
  activeModelConfig,
  onModelChange,
  displayTitle = 'Manuscript Draft',
  isEditorialRunning = false,
  editorialStatus,
  onScrollToRevision,
  className,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [internalModel, setInternalModel] = useState<any>(activeModelConfig);

  useEffect(() => {
    if (activeModelConfig) {
      setInternalModel(activeModelConfig);
    }
  }, [activeModelConfig]);

  const effectiveModel = internalModel || activeModelConfig;
  const [appliedCardIds, setAppliedCardIds] = useState<Set<string>>(new Set());
  const [rejectedCardIds, setRejectedCardIds] = useState<Set<string>>(new Set());
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [systemAccordionOpen, setSystemAccordionOpen] = useState(true);
  const [activeSystemTaskId, setActiveSystemTaskId] = useState<string | null>(null);
  const [systemTaskStatus, setSystemTaskStatus] = useState<Record<string, TaskStatus>>({});

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const parsedChapters = useMemo(() => parseBookChapters(bookContent), [bookContent]);
  const rawFindings = useMemo(() => reconcileEditorialFindings(reportEditorialFindings(metadata?.audit), parsedChapters), [metadata, parsedChapters]);
  const clusteredTasks = useMemo(() => {
    return clusterEditorialFindings(rawFindings, parsedChapters, metadata?.dossier);
  }, [rawFindings, parsedChapters, metadata?.dossier]);

  const [taskExplanations, setTaskExplanations] = useState<Record<string, string>>({});
  const [taskProposals, setTaskProposals] = useState<Record<string, TaskProposal>>({});
  const [taskHistory, setTaskHistory] = useState<{ taskId: string; status: TaskStatus; explanation: string; at: number }[]>([]);
  const liveManuscript = useRef(bookContent);
  liveManuscript.current = bookContent;
  const previousContexts = useRef<Record<string, string>>({});
  const pendingChecks = useRef(new Set<string>());
  const authorContext = JSON.stringify({ dossier: metadata?.dossier, requirements: metadata?.author_requirements, premise: metadata?.premise, genre: metadata?.genre });
  const callTaskModel = (prompt: string, system: string) => callModel ? callModel(prompt, system) : withOllamaOutputRoom(
    maxTokens => generateText(prompt, system, undefined, 0.2, undefined, undefined, effectiveModel, maxTokens, false), 8192, 8192);
  const setTaskState = (taskId: string, status: TaskStatus, explanation = '') => {
    setSystemTaskStatus(prev => ({ ...prev, [taskId]: status }));
    setTaskExplanations(prev => ({ ...prev, [taskId]: explanation }));
    setTaskHistory(prev => [...prev, { taskId, status, explanation, at: Date.now() }]);
  };

  // Debounce manual edits and undo; discard asynchronous results from older revisions.
  useEffect(() => {
    let cancelled = false;
    const changed = clusteredTasks.filter(task => {
      const context = taskContext(task, bookContent) + authorContext;
      const previous = previousContexts.current[task.id];
      previousContexts.current[task.id] = context;
      if (previous !== undefined && previous !== context) pendingChecks.current.add(task.id);
      return pendingChecks.current.has(task.id);
    });
    for (const task of changed) setTaskState(task.id, 'checking', 'Text changed; checking the original observation.');
    const timer = setTimeout(async () => {
      for (const task of changed) {
        if (cancelled) return;
        try {
          const check = await checkEditorialTask(task, bookContent, callTaskModel, authorContext);
          if (cancelled || liveManuscript.current !== bookContent) return;
          pendingChecks.current.delete(task.id);
          setTaskState(task.id, check.status, check.explanation);
        } catch (err) {
          if (!cancelled) { pendingChecks.current.delete(task.id); setTaskState(task.id, 'error', err instanceof Error ? err.message : String(err)); }
        }
      }
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [bookContent, clusteredTasks, authorContext, effectiveModel, callModel]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  const handleSendMessage = async (userText: string, view?: 'full' | 'skeletons', closing?: { title: string }) => {
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
        view,
        closing,
        provider: effectiveModel?.provider,
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
                effectiveModel,
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
        problems: response.problems,
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
      const accepted = onApplyPatch(
        patchResult.updatedManuscript,
        patchResult.matchedChapter || card.chapterNum,
        card.replacementText
      );
      if (accepted === false) {
        setCardErrors(prev => ({ ...prev, [card.id]: "Could not save manuscript changes." }));
        return;
      }
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

  const prepareSystemTask = async (task: ClusteredEditorialTask) => {
    setActiveSystemTaskId(task.id);
    setTaskState(task.id, 'working');
    const baseline = liveManuscript.current;
    try {
      const proposal = await proposeEditorialTask(task, baseline, metadata, callTaskModel, activeModelConfig?.provider);
      if (liveManuscript.current !== baseline) throw new Error('Manuscript changed while preparing edits. Prepare the task again.');
      setTaskProposals(prev => ({ ...prev, [task.id]: proposal }));
      setTaskState(task.id, 'proposed', `${proposal.cards.length} linked edits ready for review.`);
    } catch (err) {
      setTaskState(task.id, 'error', err instanceof Error ? err.message : String(err));
    } finally { setActiveSystemTaskId(null); }
  };
  const verifySystemTask = async (task: ClusteredEditorialTask) => {
    if (activeRunning) return;
    const manuscript = liveManuscript.current;
    setTaskState(task.id, 'checking');
    try {
      const check = await checkEditorialTask(task, manuscript, callTaskModel, authorContext);
      if (liveManuscript.current !== manuscript) return;
      pendingChecks.current.delete(task.id);
      setTaskState(task.id, check.status, check.explanation);
    } catch (err) { setTaskState(task.id, 'error', err instanceof Error ? err.message : String(err)); }
  };
  const handleApplySingleSystemTask = async (task: ClusteredEditorialTask) => {
    if (activeRunning) return;
    await prepareSystemTask(task);
  };
  const handleApplyAllSystemTasks = async () => {
    if (activeRunning) return;
    setIsRunning(true);
    try {
      for (const task of clusteredTasks) {
        if (systemTaskStatus[task.id] !== 'resolved' && !taskProposals[task.id]) await prepareSystemTask(task);
      }
    } finally { setIsRunning(false); }
  };
  const applyTaskProposal = async (task: ClusteredEditorialTask) => {
    const proposal = taskProposals[task.id];
    if (!proposal || activeRunning) return;
    if (proposal.baseline !== liveManuscript.current) {
      setTaskState(task.id, 'error', 'This proposal targets an older revision. Prepare the task again.');
      setTaskProposals(prev => { const next = { ...prev }; delete next[task.id]; return next; });
      return;
    }
    if (onApplyPatch(proposal.updatedManuscript, task.chapterNumber, task.problemSummary) === false) {
      setTaskState(task.id, 'error', 'Could not save manuscript changes.'); return;
    }
    previousContexts.current[task.id] = taskContext(task, proposal.updatedManuscript) + authorContext;
    liveManuscript.current = proposal.updatedManuscript;
    setTaskProposals(prev => { const next = { ...prev }; delete next[task.id]; return next; });
    setTaskState(task.id, 'checking', 'Changes applied; checking the original problem.');
    try {
      const check = await checkEditorialTask(task, proposal.updatedManuscript, callTaskModel, authorContext);
      if (liveManuscript.current !== proposal.updatedManuscript) return;
      setTaskState(task.id, check.status, check.explanation);
    } catch (err) { if (liveManuscript.current === proposal.updatedManuscript) setTaskState(task.id, 'error', err instanceof Error ? err.message : String(err)); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  const activeRunning = isRunning || isEditorialRunning || activeSystemTaskId !== null;

  return (
    <section
      className={`border border-zinc-800 rounded bg-zinc-900/40 overflow-hidden text-left flex flex-col ${className || 'h-[calc(100vh-215px)] min-h-[520px]'}`}
      aria-label="Editorial assistant studio"
    >
      {/* 1. Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-zinc-200">Editorial Review · Assistant</h2>
          <button
            type="button"
            onClick={() => setIsModelModalOpen(true)}
            className="text-[11px] font-mono text-zinc-300 bg-zinc-950 hover:bg-zinc-900 hover:text-zinc-100 hover:border-zinc-700 px-2 py-0.5 rounded border border-zinc-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer group"
            title="Change assistant provider and model"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 group-hover:scale-110 transition-transform"></span>
            <span>{formatModelDisplayLabel(effectiveModel)}</span>
            <svg className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
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
        {metadata?.audit?.need_more_evidence?.length > 0 && <div className="border border-zinc-700 p-3 text-xs text-zinc-400"><strong>Checks requiring more evidence</strong>{metadata.audit.need_more_evidence.map((note: string, i: number) => <p key={i}>{note}</p>)}</div>}
        {metadata?.audit?.central_resolution?.supported === false && <p className="text-xs text-zinc-400">Central resolution requires review: {metadata.audit.central_resolution.comment}</p>}
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
                {activeRunning ? (editorialStatus || 'Preparing Review…') : 'Prepare Review'}
              </button>
            </div>

            {systemAccordionOpen && (
              <div className="p-3 space-y-2 max-h-56 overflow-y-auto">
                {clusteredTasks.length > 0 ? (
                  clusteredTasks.map(task => {
                    const status = systemTaskStatus[task.id] || 'open';
                    const isCurrent = activeSystemTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        className="p-2 rounded bg-zinc-900/60 border border-zinc-800/60 flex items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-zinc-800 text-zinc-400">
                              Ch. {task.chapterNumbers?.join(', ') || task.chapterNumber} · {task.priority}
                            </span>
                            <span className="text-zinc-200 font-medium truncate">{task.title}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400">{task.problemSummary}</p>
                          <p className="text-[11px] text-zinc-500">{status}: {taskExplanations[task.id]}</p>
                          {task.targetQuotes.map((quote, i) => <blockquote key={i} className="text-[10px] text-zinc-500 border-l border-zinc-700 pl-2">{quote}</blockquote>)}
                          {taskProposals[task.id] && <div className="space-y-2 pt-2">
                            {taskProposals[task.id].cards.map(card => <div key={card.id} className="text-[11px] whitespace-pre-wrap">
                              <div>Chapter {card.chapterNum}: {card.rationale}</div>
                              <del className="block text-red-400">{card.searchTarget}</del>
                              <ins className="block text-emerald-400">{card.replacementText || '(deleted)'}</ins>
                            </div>)}
                            <button disabled={activeRunning} onClick={() => applyTaskProposal(task)} className="border border-zinc-600 rounded px-2 py-1">Apply all linked edits</button>
                            <button disabled={activeRunning} onClick={() => { setTaskProposals(prev => { const next = { ...prev }; delete next[task.id]; return next; }); setTaskState(task.id, 'open', 'Proposal rejected by author.'); }} className="ml-2">Reject</button>
                          </div>}
                          <button disabled={activeRunning || status === 'checking'} onClick={() => verifySystemTask(task)} className="text-[10px] underline">Verify current text</button>
                          <details className="text-[10px] text-zinc-500"><summary>History</summary>{taskHistory.filter(event => event.taskId === task.id).map((event, i) => <div key={i}>{new Date(event.at).toLocaleTimeString()}: {event.status} {event.explanation}</div>)}</details>
                        </div>

                        <div className="shrink-0 flex items-center gap-1">
                          {status === 'resolved' ? (
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
                              Prepare edits
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

            {/* Problems kept by a review, each with its ways to close it */}
            {msg.problems && msg.problems.length > 0 && (
              <div className="space-y-2 w-full mt-2">
                {msg.problems.map(problem => (
                  <div key={problem.id} className="p-3 rounded-md border border-zinc-800 bg-zinc-950/90 text-left space-y-1.5">
                    <div className="font-medium text-zinc-200 text-xs">{problem.title}</div>
                    {problem.places.length > 0 && (
                      <div className="text-[10px] font-mono text-zinc-500">{problem.places.join(', ')}</div>
                    )}
                    {problem.ways.map((way, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 text-[11px] text-zinc-400">
                        <span>{way}</span>
                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => handleSendMessage(buildCloseProblemPrompt(problem, way), undefined, { title: problem.title })}
                          className="shrink-0 px-2 py-0.5 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                        >
                          Close this way
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

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
          {QUICK_PROMPTS.map((item, idx) => (
            <button
              key={idx}
              type="button"
              disabled={activeRunning}
              onClick={() => handleSendMessage(item.prompt, item.view)}
              title={item.prompt}
              className="h-5 px-2.5 text-[10px] font-medium whitespace-nowrap bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-700 rounded transition-colors disabled:opacity-50 tracking-tight"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Text input area */}
        <div className="flex items-stretch gap-2">
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
            className="self-stretch min-h-[54px] px-4 text-xs font-semibold bg-zinc-200 hover:bg-zinc-100 disabled:opacity-50 text-zinc-900 rounded transition-colors shrink-0 flex items-center justify-center shadow-sm"
          >
            Send
          </button>
        </div>
      </div>

      <EditorialModelModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        currentConfig={effectiveModel}
        onSave={(newCfg) => {
          setInternalModel(newCfg);
          onModelChange?.(newCfg);
        }}
      />
    </section>
  );
};

export default EditorialChatStudio;
