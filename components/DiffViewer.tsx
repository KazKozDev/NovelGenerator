import React, { useState } from 'react';

interface DiffViewerProps {
  before: string;
  after: string;
  chapterNumber: number;
  strategy: string;
}

/**
 * Simple diff viewer that shows before/after text changes
 * Uses a side-by-side or unified view
 */
const DiffViewer: React.FC<DiffViewerProps> = ({ before, after, chapterNumber, strategy }) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [showFullText, setShowFullText] = useState(true);

  // Simple word-level diff algorithm
  const computeWordDiff = (oldText: string, newText: string) => {
    const oldWords = oldText.split(/(\s+)/);
    const newWords = newText.split(/(\s+)/);
    
    const changes: Array<{ type: 'added' | 'removed' | 'unchanged'; text: string }> = [];
    
    let i = 0, j = 0;
    
    while (i < oldWords.length || j < newWords.length) {
      if (i >= oldWords.length) {
        // Rest are additions
        changes.push({ type: 'added', text: newWords[j] });
        j++;
      } else if (j >= newWords.length) {
        // Rest are removals
        changes.push({ type: 'removed', text: oldWords[i] });
        i++;
      } else if (oldWords[i] === newWords[j]) {
        // Same word
        changes.push({ type: 'unchanged', text: oldWords[i] });
        i++;
        j++;
      } else {
        // Different - mark as removed and added
        changes.push({ type: 'removed', text: oldWords[i] });
        changes.push({ type: 'added', text: newWords[j] });
        i++;
        j++;
      }
    }
    
    return changes;
  };

  const diff = computeWordDiff(before, after);
  
  // Calculate statistics
  const stats = {
    added: diff.filter(d => d.type === 'added').length,
    removed: diff.filter(d => d.type === 'removed').length,
    unchanged: diff.filter(d => d.type === 'unchanged').length,
  };
  
  const totalChanges = stats.added + stats.removed;
  const changePercentage = ((totalChanges / (stats.added + stats.removed + stats.unchanged)) * 100).toFixed(1);

  // Preview lengths
  const previewLength = 1500;
  const beforePreview = before.substring(0, previewLength);
  const afterPreview = after.substring(0, previewLength);
  const isTruncated = before.length > previewLength || after.length > previewLength;

  const renderUnifiedDiff = () => {
    const displayDiff = showFullText ? diff : diff.slice(0, 500);
    
    return (
      <div style={{
        backgroundColor: '#09090b',
        padding: '12px',
        borderRadius: '6px',
        border: '1px solid #27272a',
        fontFamily: 'monospace',
        fontSize: '12px',
        lineHeight: '1.6',
        overflowX: 'auto',
        maxHeight: showFullText ? '650px' : '400px',
        overflowY: 'auto'
      }}>
        {displayDiff.map((change, idx) => {
          if (change.type === 'unchanged') {
            return <span key={idx} style={{ color: '#a1a1aa' }}>{change.text}</span>;
          } else if (change.type === 'removed') {
            return (
              <span
                key={idx}
                style={{
                  backgroundColor: 'rgba(220, 38, 38, 0.15)',
                  color: '#fca5a5',
                  textDecoration: 'line-through',
                  padding: '1px 2px',
                  borderRadius: '2px'
                }}
              >
                {change.text}
              </span>
            );
          } else {
            return (
              <span
                key={idx}
                style={{
                  backgroundColor: 'rgba(5, 150, 105, 0.15)',
                  color: '#6ee7b7',
                  padding: '1px 2px',
                  borderRadius: '2px'
                }}
              >
                {change.text}
              </span>
            );
          }
        })}
        {!showFullText && diff.length > 200 && (
          <div style={{ marginTop: '10px', color: '#71717a', fontStyle: 'italic' }}>
            ... (showing first 200 words)
          </div>
        )}
      </div>
    );
  };

  const renderSplitDiff = () => {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <div style={{
            backgroundColor: '#18181b',
            padding: '6px 10px',
            borderRadius: '4px 4px 0 0',
            border: '1px solid #27272a',
            borderBottom: 'none',
            fontWeight: '600',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#f87171'
          }}>
            Original Draft
          </div>
          <pre style={{
            backgroundColor: '#09090b',
            padding: '12px',
            borderRadius: '0 0 4px 4px',
            border: '1px solid #27272a',
            fontFamily: 'monospace',
            fontSize: '12px',
            lineHeight: '1.6',
            overflowX: 'auto',
            maxHeight: showFullText ? 'none' : '400px',
            overflowY: 'auto',
            margin: 0,
            color: '#a1a1aa',
            whiteSpace: 'pre-wrap'
          }}>
            {showFullText ? before : beforePreview}
            {!showFullText && isTruncated && '\n\n... (truncated)'}
          </pre>
        </div>
        <div>
          <div style={{
            backgroundColor: '#18181b',
            padding: '6px 10px',
            borderRadius: '4px 4px 0 0',
            border: '1px solid #27272a',
            borderBottom: 'none',
            fontWeight: '600',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#4ade80'
          }}>
            Edited Draft
          </div>
          <pre style={{
            backgroundColor: '#09090b',
            padding: '12px',
            borderRadius: '0 0 4px 4px',
            border: '1px solid #27272a',
            fontFamily: 'monospace',
            fontSize: '12px',
            lineHeight: '1.6',
            overflowX: 'auto',
            maxHeight: showFullText ? 'none' : '400px',
            overflowY: 'auto',
            margin: 0,
            color: '#a1a1aa',
            whiteSpace: 'pre-wrap'
          }}>
            {showFullText ? after : afterPreview}
            {!showFullText && isTruncated && '\n\n... (truncated)'}
          </pre>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      marginTop: '10px',
      padding: '12px',
      backgroundColor: '#18181b',
      borderRadius: '8px',
      border: '1px solid #27272a'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        <div>
          <h4 style={{ color: '#e4e4e7', margin: 0, fontSize: '13px', fontWeight: '600', letterSpacing: '-0.01em' }}>
            Chapter {chapterNumber} — Text Modifications ({strategy})
          </h4>
          <div style={{ color: '#71717a', fontSize: '11px', marginTop: '3px', fontFamily: 'monospace' }}>
            <span style={{ color: '#6ee7b7' }}>+{stats.added} added</span>
            {' • '}
            <span style={{ color: '#f87171' }}>-{stats.removed} removed</span>
            {' • '}
            <span>{changePercentage}% changed</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setViewMode(viewMode === 'unified' ? 'split' : 'unified')}
            style={{
              padding: '4px 10px',
              backgroundColor: '#27272a',
              color: '#d4d4d8',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: '600',
              fontFamily: 'monospace'
            }}
          >
            {viewMode === 'unified' ? 'Split View' : 'Unified View'}
          </button>
          
          <button
            onClick={() => setShowFullText(!showFullText)}
            style={{
              padding: '4px 10px',
              backgroundColor: '#27272a',
              color: '#d4d4d8',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: '600',
              fontFamily: 'monospace'
            }}
          >
            {showFullText ? 'Show Less' : 'Show Full Text'}
          </button>
        </div>
      </div>

      {viewMode === 'unified' ? renderUnifiedDiff() : renderSplitDiff()}
    </div>
  );
};

export default DiffViewer;
