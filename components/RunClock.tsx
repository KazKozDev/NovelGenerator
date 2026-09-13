import React, { useEffect, useState } from 'react';
import type { AgentLogEntry } from '../types';

/**
 * How long the run has been going, in the units a person waiting actually uses.
 * A book is minutes to hours of model calls, and the longest single wait — the
 * design, before any chapter view exists — used to show a spinner and nothing
 * else, which is indistinguishable from a hung run.
 */
export function elapsedLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * The run's own clock. The first logged call is when work began, and one log
 * entry is written per model call, so the count is calls, not activity.
 */
export const RunClock: React.FC<{ agentLogs: AgentLogEntry[]; isLoading: boolean; className?: string }> = ({
  agentLogs,
  isLoading,
  className = '',
}) => {
  const startedAt = agentLogs[0]?.timestamp;
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!isLoading) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, [isLoading]);
  if (!startedAt) return null;
  return (
    <span className={`font-mono text-zinc-500 ${className}`}>
      {elapsedLabel(now - startedAt)} · {agentLogs.length} call{agentLogs.length === 1 ? '' : 's'}
    </span>
  );
};

export default RunClock;
