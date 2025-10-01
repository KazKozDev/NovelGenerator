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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 pt-20 overflow-y-auto">
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-md w-full border border-sky-500/30 animate-fade-in">
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <h3 className="text-xl font-semibold text-sky-400 mb-4">
              Enter Author Name
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              This will be included in the EPUB metadata.
            </p>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="e.g., John Smith"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 p-4 bg-slate-900/50 rounded-b-lg">
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
