import React from 'react';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';

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
  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-base font-semibold text-center text-zinc-100 uppercase tracking-wide">{title}</h2>
      
      <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl shadow-sm">
        <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
          The outline defines the narrative arc and chapter milestones. You may edit the structure directly below before approving generation.
        </p>
        <TextArea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          rows={30}
          className="min-h-[550px] font-mono text-xs text-zinc-200"
          disabled={isLoading}
        />
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