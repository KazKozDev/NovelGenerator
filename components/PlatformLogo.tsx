import React from 'react';

export type Platform = 'amazon' | 'apple' | 'google' | 'ingram' | 'audible' | 'spotify' | 'youtube';

/** Which company each store or printer belongs to. */
export const PLATFORM_OF: Record<string, Platform> = {
  kindle: 'amazon',
  kdp_paperback: 'amazon',
  kdp_hardcover: 'amazon',
  apple: 'apple',
  google: 'google',
  ingram_paperback: 'ingram',
  // Audiobook stores; Google Play takes its audiobooks under the same mark as its ebooks.
  acx: 'audible',
  spotify: 'spotify',
  youtube: 'youtube',
};

// Apple, Google Play, Audible, Spotify and YouTube are the Simple Icons marks (CC0); Simple Icons carries no Amazon or IngramSpark mark,
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
  audible: {
    label: 'Audible',
    color: '#f8991c',
    body: <path fill="currentColor" d="M12.008 17.362L24 9.885v2.028l-11.992 7.509L0 11.912V9.886l12.008 7.477zm0-9.378c-2.709 0-5.085 1.363-6.448 3.47.111-.111.175-.175.286-.254 3.374-2.804 8.237-2.17 10.883 1.362l1.758-1.124c-1.394-2.044-3.786-3.454-6.48-3.454m0 3.47a4.392 4.392 0 0 0-3.548 1.821 3.597 3.597 0 0 1 2.139-.697c1.299 0 2.455.666 3.232 1.79l1.679-1.045c-.729-1.157-2.028-1.87-3.501-1.87M3.897 8.412c4.943-3.897 11.929-2.836 15.652 2.344l.031.032 1.822-1.125a11.214 11.214 0 0 0-9.394-5.085c-3.897 0-7.366 1.996-9.394 5.085.364-.412.824-.903 1.283-1.251" />,
  },
  spotify: {
    label: 'Spotify',
    color: '#1db954',
    body: <path fill="currentColor" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />,
  },
  youtube: {
    label: 'YouTube',
    color: '#ff0000',
    body: <path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />,
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
