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
  const [showFullText, setShowFullText] = useState(false);

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

  // Truncate for preview
  const previewLength = 1000;
  const beforePreview = before.substring(0, previewLength);
  const afterPreview = after.substring(0, previewLength);
  const isTruncated = before.length > previewLength || after.length > previewLength;

  const renderUnifiedDiff = () => {
    const displayDiff = showFullText ? diff : diff.slice(0, 200);
    
    return (
      <div style={{
        backgroundColor: '#1f2937',
        padding: '15px',
        borderRadius: '6px',
        fontFamily: 'monospace',
        fontSize: '13px',
        lineHeight: '1.6',
        overflowX: 'auto',
        maxHeight: showFullText ? 'none' : '400px',
        overflowY: 'auto'
      }}>
        {displayDiff.map((change, idx) => {
          if (change.type === 'unchanged') {
            return <span key={idx} style={{ color: '#d1d5db' }}>{change.text}</span>;
          } else if (change.type === 'removed') {
            return (
              <span
                key={idx}
                style={{
                  backgroundColor: '#7f1d1d',
                  color: '#fca5a5',
                  textDecoration: 'line-through',
                  padding: '2px 0'
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
                  backgroundColor: '#14532d',
                  color: '#86efac',
                  padding: '2px 0'
                }}
              >
                {change.text}
              </span>
            );
          }
        })}
        {!showFullText && diff.length > 200 && (
          <div style={{ marginTop: '10px', color: '#9ca3af', fontStyle: 'italic' }}>
            ... (showing first 200 words)
          </div>
        )}
      </div>
    );
  };

  const renderSplitDiff = () => {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <div style={{
            backgroundColor: '#374151',
            padding: '8px',
            borderRadius: '4px 4px 0 0',
            fontWeight: 'bold',
            fontSize: '12px',
            color: '#fca5a5'
          }}>
            Before (Original)
          </div>
          <pre style={{
            backgroundColor: '#1f2937',
            padding: '15px',
            borderRadius: '0 0 4px 4px',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: '1.6',
            overflowX: 'auto',
            maxHeight: showFullText ? 'none' : '400px',
            overflowY: 'auto',
            margin: 0,
            color: '#d1d5db',
            whiteSpace: 'pre-wrap'
          }}>
            {showFullText ? before : beforePreview}
            {!showFullText && isTruncated && '\n\n... (truncated)'}
          </pre>
        </div>
        <div>
          <div style={{
            backgroundColor: '#374151',
            padding: '8px',
            borderRadius: '4px 4px 0 0',
            fontWeight: 'bold',
            fontSize: '12px',
            color: '#86efac'
          }}>
            After (Edited)
          </div>
          <pre style={{
            backgroundColor: '#1f2937',
            padding: '15px',
            borderRadius: '0 0 4px 4px',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: '1.6',
            overflowX: 'auto',
            maxHeight: showFullText ? 'none' : '400px',
            overflowY: 'auto',
            margin: 0,
            color: '#d1d5db',
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
      marginTop: '15px',
      padding: '15px',
      backgroundColor: '#374151',
      borderRadius: '8px',
      border: '1px solid #4b5563'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px'
      }}>
        <div>
          <h4 style={{ color: '#f3f4f6', margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
            📝 Chapter {chapterNumber} - Text Changes ({strategy})
          </h4>
          <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>
            <span style={{ color: '#86efac' }}>+{stats.added} added</span>
            {' • '}
            <span style={{ color: '#fca5a5' }}>-{stats.removed} removed</span>
            {' • '}
            <span>{changePercentage}% changed</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setViewMode(viewMode === 'unified' ? 'split' : 'unified')}
            style={{
              padding: '6px 12px',
              backgroundColor: '#4b5563',
              color: '#f3f4f6',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500'
            }}
          >
            {viewMode === 'unified' ? '📊 Split View' : '📄 Unified View'}
          </button>
          
          <button
            onClick={() => setShowFullText(!showFullText)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#4b5563',
              color: '#f3f4f6',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500'
            }}
          >
            {showFullText ? '📉 Show Less' : '📈 Show Full Text'}
          </button>
        </div>
      </div>

      {viewMode === 'unified' ? renderUnifiedDiff() : renderSplitDiff()}
    </div>
  );
};

export default DiffViewer;
