import React from 'react';
import { AgentLogEntry } from '../types';
import DiffViewer from './DiffViewer';

interface AgentActivityLogProps {
  logs: AgentLogEntry[];
}

const AgentActivityLog: React.FC<AgentActivityLogProps> = ({ logs }) => {
  if (logs.length === 0) {
    return null;
  }

  const getTypeColor = (type: AgentLogEntry['type']) => {
    switch (type) {
      case 'decision': return { bg: 'rgba(2, 132, 199, 0.2)', text: '#7dd3fc', border: '#0284c7' };
      case 'execution': return { bg: 'rgba(71, 85, 105, 0.2)', text: '#cbd5e1', border: '#64748b' };
      case 'evaluation': return { bg: 'rgba(99, 102, 241, 0.2)', text: '#a5b4fc', border: '#6366f1' };
      case 'iteration': return { bg: 'rgba(51, 65, 85, 0.2)', text: '#94a3b8', border: '#475569' };
      case 'warning': return { bg: 'rgba(234, 179, 8, 0.2)', text: '#fde047', border: '#eab308' };
      case 'success': return { bg: 'rgba(34, 197, 94, 0.2)', text: '#86efac', border: '#22c55e' };
      case 'diff': return { bg: 'rgba(217, 70, 239, 0.2)', text: '#f0abfc', border: '#d946ef' };
      default: return { bg: 'rgba(71, 85, 105, 0.2)', text: '#cbd5e1', border: '#64748b' };
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  // Group logs by chapter
  const logsByChapter = logs.reduce((acc, log) => {
    if (!acc[log.chapterNumber]) {
      acc[log.chapterNumber] = [];
    }
    acc[log.chapterNumber].push(log);
    return acc;
  }, {} as Record<number, AgentLogEntry[]>);

  return (
    <div style={{
      marginTop: '10px',
      padding: '0',
      backgroundColor: 'transparent'
    }}>
      {Object.entries(logsByChapter).map(([chapterNum, chapterLogs]) => (
        <div key={chapterNum} style={{ marginBottom: '16px' }}>
          <div style={{
            color: '#94a3b8',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
            padding: '6px 8px',
            backgroundColor: '#1e293b',
            borderRadius: '6px',
            border: '1px solid #334155'
          }}>
            Chapter {chapterNum} Events
          </div>

          {chapterLogs.map((log, idx) => {
            const style = getTypeColor(log.type);
            return (
              <div key={`${log.timestamp}-${idx}`}>
                {log.type === 'diff' && log.beforeText && log.afterText ? (
                  // Render diff viewer for diff entries
                  <DiffViewer
                    before={log.beforeText}
                    after={log.afterText}
                    chapterNumber={log.chapterNumber}
                    strategy={log.strategy || 'unknown'}
                  />
                ) : (
                  // Render normal log entry
                  <div
                    style={{
                      padding: '10px 12px',
                      marginBottom: '6px',
                      backgroundColor: '#0f172a',
                      borderLeft: `3px solid ${style.border}`,
                      borderTop: '1px solid #1e293b',
                      borderRight: '1px solid #1e293b',
                      borderBottom: '1px solid #1e293b',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      marginBottom: '4px' 
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ 
                          backgroundColor: style.bg,
                          color: style.text,
                          border: `1px solid ${style.border}`,
                          fontWeight: '700',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase',
                          fontSize: '10px',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          marginRight: '8px'
                        }}>
                          {log.type}
                        </span>
                      </div>
                      <span style={{ color: '#64748b', fontSize: '10px', fontFamily: 'monospace' }}>
                        {formatTime(log.timestamp)}
                      </span>
                    </div>
                    
                    <div style={{ color: '#e2e8f0', fontSize: '12px', lineHeight: '1.5' }}>
                      {log.message}
                    </div>

                  {log.details && (
                    <details style={{ marginLeft: '24px', marginTop: '8px' }}>
                      <summary style={{ 
                        color: '#9ca3af', 
                        fontSize: '12px'
                      }}>
                        Details
                      </summary>
                      <pre style={{
                        marginTop: '8px',
                        padding: '8px',
                        backgroundColor: '#1f2937',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#d1d5db',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {logs.length > 0 && (
        <div style={{
          marginTop: '15px',
          padding: '10px',
          backgroundColor: '#374151',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#9ca3af',
          textAlign: 'center'
        }}>
          Total: {logs.length} log entries
        </div>
      )}
    </div>
  );
};

export default AgentActivityLog;
