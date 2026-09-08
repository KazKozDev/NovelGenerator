import React from 'react';
import { AgentLogEntry } from '../types';
import DiffViewer from './DiffViewer';

interface AgentActivityLogProps {
  logs: AgentLogEntry[];
}

/** Severity is the only thing here that earns a colour; everything else stays on the palette. */
const ACCENT: Record<string, string> = {
  warning: 'border-l-amber-500/70',
  success: 'border-l-emerald-500/70',
  default: 'border-l-zinc-700',
};

const AgentActivityLog: React.FC<AgentActivityLogProps> = ({ logs }) => {
  if (logs.length === 0) return null;

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const logsByChapter = logs.reduce((acc, log) => {
    (acc[log.chapterNumber] ||= []).push(log);
    return acc;
  }, {} as Record<number, AgentLogEntry[]>);

  return (
    <div className="mt-2">
      {Object.entries(logsByChapter).map(([chapterNum, chapterLogs]) => (
        <div key={chapterNum} className="mb-4">
          <h4 className="text-xs font-semibold uppercase text-zinc-500 mb-1.5">
            Chapter {chapterNum}
          </h4>

          {chapterLogs.map((log, idx) => (
            <div key={`${log.timestamp}-${idx}`}>
              {log.type === 'diff' && log.beforeText && log.afterText ? (
                <DiffViewer
                  before={log.beforeText}
                  after={log.afterText}
                  chapterNumber={log.chapterNumber}
                  strategy={log.strategy || 'unknown'}
                />
              ) : (
                <div className={`mb-1.5 pl-2.5 border-l-2 ${ACCENT[log.type] || ACCENT.default}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs uppercase text-zinc-500">{log.type}</span>
                    {/* A timestamp is a machine value, so it keeps the monospaced face. */}
                    <span className="text-xs text-zinc-500 shrink-0">{formatTime(log.timestamp)}</span>
                  </div>
                  <p className="text-sm text-zinc-400">{log.message}</p>

                  {log.details && (
                    <details className="mt-1">
                      <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">Details</summary>
                      <pre className="mt-1 p-2 text-xs text-zinc-400 border border-zinc-800 rounded overflow-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <p className="text-xs text-zinc-500 pt-1">{logs.length} events logged</p>
    </div>
  );
};

export default AgentActivityLog;
