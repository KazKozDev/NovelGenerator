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
      <h2 className="text-2xl font-semibold text-center text-sky-400">{title}</h2>
      
      <div className="p-4 bg-slate-700 rounded-md shadow">
        <p className="text-sm text-slate-300 mb-4">
          The AI has generated the following outline for your story. Please review it carefully. You can edit the text directly in the box below to make any changes you see fit. When you are satisfied with the outline, click "Approve & Continue" to proceed with character and chapter generation.
        </p>
        <TextArea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          rows={30}
          className="bg-slate-900/50 border-slate-600 focus:ring-sky-500 focus:border-sky-500 min-h-[600px]"
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