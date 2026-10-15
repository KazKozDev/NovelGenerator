import React, { useState, useEffect, useRef } from 'react';

interface BookCoverUploadProps {
  title: string;
  genre?: string;
  author?: string;
  onAuthorChange?: (author: string) => void;
}

export const BookCoverUpload: React.FC<BookCoverUploadProps> = ({
  title,
  genre,
  author: controlledAuthor,
  onAuthorChange,
}) => {
  const [author, setAuthor] = useState<string>(controlledAuthor ?? '');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cleanTitle = title.trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '_');
  const storageKey = `novel_cover_${cleanTitle}`;
  const authorStorageKey = `novel_author_${cleanTitle}`;

  useEffect(() => {
    if (controlledAuthor !== undefined) {
      setAuthor(controlledAuthor);
    }
  }, [controlledAuthor]);

  useEffect(() => {
    if (controlledAuthor === undefined || controlledAuthor === '') {
      try {
        const savedAuthor = localStorage.getItem(authorStorageKey) || localStorage.getItem('novel_author_name');
        if (savedAuthor) {
          setAuthor(savedAuthor);
          onAuthorChange?.(savedAuthor);
        }
      } catch {
        // localStorage unavailable
      }
    }
  }, [authorStorageKey, controlledAuthor, onAuthorChange]);

  const handleAuthorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAuthor(val);
    onAuthorChange?.(val);
    try {
      localStorage.setItem('novel_author_name', val);
      if (cleanTitle) {
        localStorage.setItem(authorStorageKey, val);
      }
    } catch {
      // localStorage restricted
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setCoverUrl(saved);
        setFileInfo({ name: 'Saved cover', size: '' });
      } else {
        setCoverUrl(null);
        setFileInfo(null);
      }
    } catch {
      // localStorage unavailable or private browsing
    }
  }, [storageKey]);

  const handleFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, or WEBP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image file must be under 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setCoverUrl(dataUrl);
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        setFileInfo({ name: file.name, size: `${sizeMb} MB` });
        try {
          localStorage.setItem(storageKey, dataUrl);
        } catch {
          // localStorage full or restricted
        }
      }
    };
    reader.onerror = () => {
      setError('Could not read the image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    setCoverUrl(null);
    setFileInfo(null);
    setError(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  };

  return (
    <div className="border border-zinc-800 rounded bg-zinc-900/40 overflow-hidden text-left flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
        <h2 className="text-sm font-medium text-zinc-200">Book Cover</h2>
        {coverUrl && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-xs text-zinc-400 hover:text-red-400 transition-colors"
            title="Remove cover"
          >
            Remove
          </button>
        )}
      </div>

      <div className="p-3.5 sm:p-4 flex flex-col items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleInputChange}
          aria-label="Upload book cover"
        />

        {coverUrl ? (
          <div className="w-full flex flex-col items-center space-y-3">
            <div className="relative group max-w-[200px] w-full aspect-[2/3] rounded-md overflow-hidden border border-zinc-700/60 shadow-xl shadow-black/60 bg-zinc-950">
              <img
                src={coverUrl}
                alt={title || 'Book cover'}
                className="w-full h-full object-cover"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer text-xs text-zinc-100 font-medium"
              >
                Change cover
              </div>
            </div>

            {fileInfo && (
              <div className="text-center">
                <p className="text-xs text-zinc-300 font-medium truncate max-w-[190px]">
                  {fileInfo.name}
                </p>
                {author && (
                  <p className="text-[11px] text-zinc-400 font-medium truncate max-w-[190px] mt-0.5">
                    by {author}
                  </p>
                )}
                {fileInfo.size && (
                  <p className="text-[11px] text-zinc-500 mt-0.5">{fileInfo.size}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
              >
                Replace image
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center space-y-3">
            {/* Styled Book Mockup */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full max-w-[200px] aspect-[2/3] rounded-md border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-between p-4 text-center relative overflow-hidden select-none ${
                isDragging
                  ? 'border-zinc-400 bg-zinc-800/60'
                  : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900/50'
              }`}
            >
              <div className="w-full">
                {genre && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    {genre}
                  </span>
                )}
              </div>

              <div className="w-full space-y-2">
                <div className="w-9 h-9 mx-auto rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xs font-semibold text-zinc-200 line-clamp-3 leading-snug">
                  {title || 'Untitled Book'}
                </h3>
                {author ? (
                  <p className="text-[11px] text-zinc-400 font-medium truncate max-w-[170px]">{author}</p>
                ) : (
                  <p className="text-[10px] text-zinc-600 italic">Author name</p>
                )}
              </div>

              <div className="w-full">
                <span className="inline-block text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded">
                  Upload cover
                </span>
              </div>
            </div>

            <div className="text-center text-xs space-y-1">
              <p className="text-zinc-400 font-medium">Click or drag image here</p>
              <p className="text-[11px] text-zinc-500">PNG, JPG, WEBP (up to 10 MB)</p>
              <p className="text-[11px] text-zinc-600">2:3 aspect ratio recommended</p>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
        )}

        {/* Author Input Field under the book cover */}
        <div className="w-full mt-4 pt-3.5 border-t border-zinc-800 text-left space-y-1.5">
          <label
            htmlFor="book-author-input"
            className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400"
          >
            Author
          </label>
          <input
            id="book-author-input"
            type="text"
            value={author}
            onChange={handleAuthorInputChange}
            placeholder="Author name"
            aria-label="Book author"
            className="w-full h-8 px-2.5 rounded bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 focus:outline-none text-xs text-zinc-200 placeholder:text-zinc-600 transition-colors"
          />
          <p className="text-[11px] text-zinc-500">
            Saved in PDF, EPUB, and project metadata
          </p>
        </div>
      </div>
    </div>
  );
};

export default BookCoverUpload;
