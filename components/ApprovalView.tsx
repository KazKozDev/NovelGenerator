import React, { useState } from 'react';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';
import { MarkdownView } from './common/MarkdownView';

interface ApprovalViewProps {
  title: string;
  content: string;
  onContentChange: (newContent: string) => void;
  onApprove: () => void;
  onRegenerate: () => void;
  isLoading: boolean;
}

const ApprovalView: React.FC<ApprovalViewProps> = ({
  title,
  content,
  onContentChange,
  onApprove,
  onRegenerate,
  isLoading,
}) => {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <h2 className="text-base font-semibold text-zinc-100 uppercase tracking-wide">{title}</h2>
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 text-xs font-mono self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setTab('edit')}
            className={`px-3 py-1 rounded transition-colors ${tab === 'edit' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Edit Outline
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`px-3 py-1 rounded transition-colors ${tab === 'preview' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Preview Markdown
          </button>
        </div>
      </div>
      
      <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl shadow-sm">
        <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
          The outline defines the narrative arc and chapter milestones. You may edit the structure directly below before approving generation.
        </p>
        {tab === 'edit' ? (
          <TextArea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={30}
            className="min-h-[550px] font-mono text-xs text-zinc-200"
            disabled={isLoading}
          />
        ) : (
          <div className="min-h-[550px] max-h-[70vh] overflow-y-auto p-6 bg-zinc-900 border border-zinc-800 rounded-md text-left">
            <MarkdownView content={content} className="text-sm font-serif leading-relaxed" />
          </div>
        )}
      </div>
      
      <div className="flex justify-between items-center mt-6">
        <Button onClick={onRegenerate} disabled={isLoading} variant="secondary">
          {isLoading ? 'Regenerating...' : 'Regenerate Outline'}
        </Button>
        <Button onClick={onApprove} disabled={isLoading} variant="primary">
          {isLoading ? 'Processing...' : 'Approve & Continue'}
        </Button>
      </div>
    </div>
  );
};

export default ApprovalView;