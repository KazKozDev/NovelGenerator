import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'novelGenerator_theme';

/** The document owns the theme; this only flips it and remembers the choice. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [light, setLight] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('light'));

  useEffect(() => {
    document.documentElement.classList.toggle('light', light);
    try { localStorage.setItem(STORAGE_KEY, light ? 'light' : 'dark'); } catch { /* private mode */ }
  }, [light]);

  return (
    <button
      type="button"
      onClick={() => setLight(value => !value)}
      title={light ? 'Switch to dark' : 'Switch to light'}
      aria-pressed={light}
      className={`text-zinc-500 hover:text-zinc-200 transition-colors ${className}`}
    >
      {light ? (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10l1.4 1.4m0-12.8l-1.4 1.4m-10 10l-1.4 1.4" />
        </svg>
      )}
      <span className="sr-only">{light ? 'Switch to dark theme' : 'Switch to light theme'}</span>
    </button>
  );
}
