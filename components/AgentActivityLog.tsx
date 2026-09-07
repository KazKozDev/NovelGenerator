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
      case 'decision': return { bg: '#27272a', text: '#e4e4e7', border: '#52525b' };
      case 'execution': return { bg: '#18181b', text: '#a1a1aa', border: '#3f3f46' };
      case 'evaluation': return { bg: '#27272a', text: '#d4d4d8', border: '#52525b' };
      case 'iteration': return { bg: '#18181b', text: '#71717a', border: '#3f3f46' };
      case 'warning': return { bg: 'rgba(180, 83, 9, 0.15)', text: '#fcd34d', border: '#78350f' };
      case 'success': return { bg: 'rgba(5, 150, 105, 0.15)', text: '#6ee7b7', border: '#064e3b' };
      case 'diff': return { bg: '#27272a', text: '#e4e4e7', border: '#52525b' };
      default: return { bg: '#18181b', text: '#a1a1aa', border: '#3f3f46' };
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
      marginTop: '8px',
      padding: '0',
      backgroundColor: 'transparent'
    }}>
      {Object.entries(logsByChapter).map(([chapterNum, chapterLogs]) => (
        <div key={chapterNum} style={{ marginBottom: '14px' }}>
          <div style={{
            color: '#a1a1aa',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '6px',
            padding: '5px 8px',
            backgroundColor: '#18181b',
            borderRadius: '6px',
            border: '1px solid #27272a'
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
                      padding: '8px 10px',
                      marginBottom: '5px',
                      backgroundColor: '#09090b',
                      borderLeft: `2px solid ${style.border}`,
                      borderTop: '1px solid #27272a',
                      borderRight: '1px solid #27272a',
                      borderBottom: '1px solid #27272a',
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
                          fontWeight: '600',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase',
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          marginRight: '6px'
                        }}>
                          {log.type}
                        </span>
                      </div>
                      <span style={{ color: '#52525b', fontSize: '10px', fontFamily: 'monospace' }}>
                        {formatTime(log.timestamp)}
                      </span>
                    </div>
                    
                    <div style={{ color: '#d4d4d8', fontSize: '11px', lineHeight: '1.5' }}>
                      {log.message}
                    </div>

                  {log.details && (
                    <details style={{ marginTop: '6px' }}>
                      <summary style={{ 
                        color: '#71717a', 
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}>
                        Details
                      </summary>
                      <pre style={{
                        marginTop: '6px',
                        padding: '6px',
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: '4px',
                        fontSize: '10px',
                        color: '#a1a1aa',
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
          marginTop: '10px',
          padding: '6px',
          backgroundColor: '#18181b',
          borderRadius: '4px',
          border: '1px solid #27272a',
          fontSize: '11px',
          color: '#71717a',
          fontFamily: 'monospace',
          textAlign: 'center'
        }}>
          {logs.length} events logged
        </div>
      )}
    </div>
  );
};

export default AgentActivityLog;
