import React, { useState } from 'react';
import { Button } from './common/Button';

interface AuthorPromptModalProps {
  isOpen: boolean;
  onConfirm: (authorName: string) => void;
  onCancel: () => void;
  defaultAuthor?: string;
}

const AuthorPromptModal: React.FC<AuthorPromptModalProps> = ({ 
  isOpen, 
  onConfirm, 
  onCancel, 
  defaultAuthor = '' 
}) => {
  const [authorName, setAuthorName] = useState(defaultAuthor);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(authorName || 'Unknown Author');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 p-4 pt-20 overflow-y-auto">
      <div className="bg-zinc-900 rounded shadow-2xl max-w-md w-full border border-zinc-800">
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <h3 className="text-base font-semibold text-zinc-100 mb-2">
              Enter Author Name
            </h3>
            <p className="text-zinc-400 text-xs mb-4">
              This will be included in the EPUB metadata.
            </p>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="e.g., John Smith"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 p-4 bg-zinc-950/60 border-t border-zinc-800/80 rounded-b">
            <Button
              type="button"
              onClick={onCancel}
              variant="secondary"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
            >
              Export
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthorPromptModal;
