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

  const getTypeEmoji = (type: AgentLogEntry['type']) => {
    switch (type) {
      case 'decision': return '🤖';
      case 'execution': return '⚙️';
      case 'evaluation': return '📊';
      case 'iteration': return '🔄';
      case 'warning': return '⚠️';
      case 'success': return '✅';
      case 'diff': return '📝';
      default: return '📝';
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
      marginTop: '20px',
      padding: '20px',
      backgroundColor: '#1f2937',
      borderRadius: '8px'
    }}>
      <h3 style={{ 
        color: '#f3f4f6', 
        marginBottom: '15px',
        fontSize: '18px',
        fontWeight: 'bold'
      }}>
        Agent Activity Log
      </h3>

      {Object.entries(logsByChapter).map(([chapterNum, chapterLogs]) => (
        <div key={chapterNum} style={{ marginBottom: '20px' }}>
          <div style={{
            color: '#9ca3af',
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '10px',
            padding: '8px',
            backgroundColor: '#374151',
            borderRadius: '4px'
          }}>
            Chapter {chapterNum}
          </div>

          {chapterLogs.map((log, idx) => (
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
                    padding: '10px',
                    marginBottom: '8px',
                    backgroundColor: '#374151',
                    borderLeft: '4px solid #64748b',
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    marginBottom: '4px' 
                  }}>
                    <span style={{ marginRight: '8px', fontSize: '16px' }}>
                      {getTypeEmoji(log.type)}
                    </span>
                    <span style={{ 
                      color: '#9ca3af',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      fontSize: '11px',
                      marginRight: '8px'
                    }}>
                      {log.type}
                    </span>
                    <span style={{ color: '#6b7280', fontSize: '11px' }}>
                      {formatTime(log.timestamp)}
                    </span>
                  </div>
                  
                  <div style={{ color: '#e5e7eb', marginLeft: '24px' }}>
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
          ))}
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
