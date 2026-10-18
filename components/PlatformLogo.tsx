import React from 'react';

export type Platform = 'amazon' | 'apple' | 'google' | 'ingram';

/** Which company each store or printer belongs to. */
export const PLATFORM_OF: Record<string, Platform> = {
  kindle: 'amazon',
  kdp_paperback: 'amazon',
  kdp_hardcover: 'amazon',
  apple: 'apple',
  google: 'google',
  ingram_paperback: 'ingram',
};

// Apple and Google Play are the Simple Icons marks (CC0); Simple Icons carries no Amazon or IngramSpark mark,
// so those two are drawn here: Amazon's smile-arrow and a spark.
const MARKS: Record<Platform, { label: string; color: string; body: React.ReactNode }> = {
  apple: {
    label: 'Apple',
    color: '#a2aaad',
    body: <path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />,
  },
  google: {
    label: 'Google Play',
    color: '#34a853',
    body: <path fill="currentColor" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z" />,
  },
  amazon: {
    label: 'Amazon',
    color: '#ff9900',
    body: (
      <g fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 13.5c5.5 4.2 13.5 4.6 19 .8" />
        <path d="M18.2 12.6l3.3 1.7-1.1 3.4" />
      </g>
    ),
  },
  ingram: {
    label: 'IngramSpark',
    color: '#f15a29',
    body: <path fill="currentColor" d="M12 1.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3L2.5 11l7.3-2.2z" />,
  },
};

/** The platform's mark in its own colour, toned down to sit quietly beside a store's or printer's name. */
export default function PlatformLogo({ id, className = 'h-14 w-14' }: { id: string; className?: string }) {
  const platform = PLATFORM_OF[id];
  if (!platform) return null;
  const mark = MARKS[platform];
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={mark.label} className={`${className} shrink-0 opacity-60 saturate-50`} style={{ color: mark.color }}>
      {mark.body}
    </svg>
  );
}
