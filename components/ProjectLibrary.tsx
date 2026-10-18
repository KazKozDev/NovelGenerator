import React from 'react';

/** One book of the library, as /api/books describes it. */
export interface LibraryBook {
  folder: string;
  title: string;
  updatedAt: number;
  genre?: string;
  premise?: string;
  chaptersWritten: number;
  chaptersPlanned: number;
  words: number;
  finished: boolean;
  cover: string | null;
}

interface ProjectLibraryProps {
  /** The book the app has open now, by its title; its card says so. */
  currentTitle?: string;
  /** A book is being written: another one cannot be opened until it stops. */
  busy: boolean;
  onOpen: (book: LibraryBook) => Promise<void>;
  onNew: () => void;
  /** A backup file (.project.json) chosen by the person. */
  onLoad: (file: File) => Promise<void>;
  /** Clears the open book from the app; given only while one is open. */
  onReset?: () => void;
}

const coverUrl = (book: LibraryBook) =>
  `/api/book-file?${new URLSearchParams({ title: book.folder, kind: 'covers', name: book.cover || '' })}`;

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function edited(at: number): string {
  const minutes = Math.round((at - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relative.format(days, 'day');
  return new Date(at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

function progress(book: LibraryBook): string {
  if (book.finished) return `${book.chaptersWritten} chapters · ${book.words.toLocaleString('en')} words`;
  if (!book.chaptersWritten) return 'Planning';
  return `${book.chaptersWritten} of ${book.chaptersPlanned} chapters`;
}

/** A cover for a book that has none yet: its title set on a dark board, tinted by the title itself. */
const PlainCover: React.FC<{ book: LibraryBook }> = ({ book }) => {
  const hue = [...book.title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <div
      className="absolute inset-0 flex flex-col justify-between p-4 text-left"
      style={{ background: `linear-gradient(160deg, hsl(${hue} 22% 20%) 0%, hsl(${hue} 30% 9%) 100%)` }}
    >
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">{book.genre || 'Novel'}</span>
      <span className="font-serif text-lg leading-snug text-white/90 line-clamp-5" style={{ fontFamily: 'ui-serif, Georgia, Cambria, serif' }}>
        {book.title}
      </span>
      <span className="h-px w-8 bg-white/30" />
    </div>
  );
};

const BookCard: React.FC<{ book: LibraryBook; current: boolean; opening: boolean; disabled: boolean; onOpen: () => void }> = ({ book, current, opening, disabled, onOpen }) => {
  const [broken, setBroken] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      title={book.premise || book.title}
      className="group flex flex-col justify-start text-left focus:outline-none disabled:cursor-not-allowed"
    >
      <div className="relative aspect-[5/8] overflow-hidden rounded-sm bg-zinc-900 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ring-1 ring-zinc-800 transition-all duration-300 group-hover:-translate-y-1 group-hover:ring-zinc-600 group-hover:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.75)] group-focus-visible:ring-2 group-focus-visible:ring-zinc-400 group-disabled:opacity-50 group-disabled:group-hover:translate-y-0">
        {book.cover && !broken ? (
          <img src={coverUrl(book)} alt="" loading="lazy" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <PlainCover book={book} />
        )}
        {/* The spine: a fold of light and shade along the left edge. */}
        <span className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/35 via-white/10 to-transparent" />
        {opening && (
          <span className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 text-xs text-zinc-200 backdrop-blur-[1px]">Opening…</span>
        )}
      </div>
      <div className="mt-3 space-y-0.5 px-0.5">
        <p className="text-sm font-medium leading-snug text-zinc-100 line-clamp-2 group-hover:text-white" style={{ fontFamily: 'ui-serif, Georgia, Cambria, serif' }}>{book.title}</p>
        <p className="text-xs text-zinc-500">
          {book.finished && <span className="text-emerald-400/90">Finished · </span>}
          {progress(book)}
        </p>
        <p className="text-[11px] text-zinc-600">{current && <span className="text-zinc-300">Open now · </span>}Edited {edited(book.updatedAt)}</p>
      </div>
    </button>
  );
};

/** Stage 0: every book in Documents/NovelGenerator as a cover; one opens it, the first tile starts a new one. */
const ProjectLibrary: React.FC<ProjectLibraryProps> = ({ currentTitle, busy, onOpen, onNew, onLoad, onReset }) => {
  const [books, setBooks] = React.useState<LibraryBook[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [opening, setOpening] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/books')
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(data => { if (!cancelled) setBooks(Array.isArray(data?.books) ? data.books : []); })
      .catch(() => { if (!cancelled) { setFailed(true); setBooks([]); } });
    return () => { cancelled = true; };
  }, []);

  const isCurrent = (book: LibraryBook) => !!currentTitle && (book.title === currentTitle || book.folder === currentTitle);

  const open = async (book: LibraryBook) => {
    setOpening(book.folder);
    try { await onOpen(book); } finally { setOpening(null); }
  };

  return (
    <section aria-label="Library" className="animate-fade-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Library</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {books === null ? 'Reading Documents/NovelGenerator…' : failed ? 'The book folders could not be read.' : `${books.length} ${books.length === 1 ? 'book' : 'books'} in Documents/NovelGenerator`}
          </p>
        </div>
        {busy && <p className="text-xs text-amber-400/90">A book is being written; stop it to open another.</p>}
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
        <button type="button" onClick={onNew} disabled={busy} className="group flex flex-col justify-start text-left focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
          <div className="relative flex aspect-[5/8] flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-zinc-700 bg-zinc-900/30 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-zinc-500 group-hover:bg-zinc-900/60 group-focus-visible:ring-2 group-focus-visible:ring-zinc-400">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 text-2xl font-light text-zinc-400 transition-colors group-hover:border-zinc-500 group-hover:text-zinc-100">+</span>
            <span className="text-xs text-zinc-500 group-hover:text-zinc-300">Settings for a new book</span>
          </div>
          <div className="mt-3 px-0.5">
            <p className="text-sm font-medium text-zinc-300 group-hover:text-zinc-100">New book</p>
            <p className="text-xs text-zinc-600">Premise, chapters, models</p>
          </div>
        </button>

        {/* Two half tiles in one cover's place: a backup to load, and the open book to clear. */}
        <div className="flex aspect-[5/8] flex-col gap-3">
          <label className={`group relative flex flex-1 flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-zinc-700 bg-zinc-900/30 transition-all duration-300 ${busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:-translate-y-0.5 hover:border-zinc-500 hover:bg-zinc-900/60'}`} title="Load a backup (.project.json)">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 text-lg text-zinc-400 transition-colors group-hover:border-zinc-500 group-hover:text-zinc-100" aria-hidden="true">↑</span>
            <span className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100">Load project</span>
            <span className="text-[11px] text-zinc-600">From a .project.json backup</span>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              disabled={busy}
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void onLoad(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={onReset}
            disabled={!onReset || busy}
            title={onReset ? 'Close the open book; its files stay in Documents/NovelGenerator' : 'No book is open'}
            className="group flex flex-1 flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-zinc-700 bg-zinc-900/30 transition-all duration-300 enabled:hover:-translate-y-0.5 enabled:hover:border-zinc-500 enabled:hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 text-lg text-zinc-400 transition-colors group-enabled:group-hover:border-zinc-500 group-enabled:group-hover:text-zinc-100" aria-hidden="true">↺</span>
            <span className="text-xs font-medium text-zinc-300 group-enabled:group-hover:text-zinc-100">Reset project</span>
            <span className="text-[11px] text-zinc-600">{onReset ? 'Close the open book' : 'No book is open'}</span>
          </button>
        </div>

        {books === null && Array.from({ length: 3 }, (_, i) => (
          <div key={i} aria-hidden="true">
            <div className="aspect-[5/8] animate-pulse rounded-sm bg-zinc-900" />
            <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-zinc-900" />
          </div>
        ))}

        {books?.map(book => (
          <BookCard
            key={book.folder}
            book={book}
            current={isCurrent(book)}
            opening={opening === book.folder}
            disabled={(busy && !isCurrent(book)) || (!!opening && opening !== book.folder)}
            onOpen={() => void open(book)}
          />
        ))}
      </div>
    </section>
  );
};

export default ProjectLibrary;
