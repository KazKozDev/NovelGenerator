import React, { useEffect, useId, useState } from 'react';

const STORAGE_KEY = 'novelGenerator_theme';

/** The document owns the theme; this only flips it and remembers the choice. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const uniqueId = useId();
  const sunGradId = `sunGrad-${uniqueId}`;
  const moonGradId = `moonGrad-${uniqueId}`;
  const starGradId = `starGrad-${uniqueId}`;

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
      title={light ? 'Switch to dark theme' : 'Switch to light theme'}
      aria-pressed={light}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-all duration-200 group ${
        light
          ? 'border-indigo-200/80 bg-indigo-50/70 hover:bg-indigo-100/80 hover:border-indigo-300 shadow-sm'
          : 'border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 hover:border-amber-500/40 shadow-sm'
      } ${className}`}
    >
      {light ? (
        <svg
          className="w-4 h-4 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110 filter drop-shadow-[0_1px_2px_rgba(99,102,241,0.3)]"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={moonGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#818CF8" />
              <stop offset="100%" stopColor="#4F46E5" />
            </linearGradient>
            <linearGradient id={starGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
          </defs>
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            fill={`url(#${moonGradId})`}
            stroke="#6366F1"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18.5 4l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z"
            fill={`url(#${starGradId})`}
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4 transition-transform duration-300 group-hover:rotate-45 group-hover:scale-110 filter drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id={sunGradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="55%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#F59E0B" />
            </radialGradient>
          </defs>
          <circle
            cx="12"
            cy="12"
            r="4.5"
            fill={`url(#${sunGradId})`}
            stroke="#F59E0B"
            strokeWidth="1"
          />
          <path
            stroke="#FBBF24"
            strokeWidth="1.8"
            strokeLinecap="round"
            d="M12 2.5v2m0 15v2M2.5 12h2m15 0h2M5.28 5.28l1.42 1.42m10.6 10.6l1.42 1.42m0-13.44l-1.42 1.42m-10.6 10.6l-1.42 1.42"
          />
        </svg>
      )}
      <span className="sr-only">{light ? 'Switch to dark theme' : 'Switch to light theme'}</span>
    </button>
  );
}
