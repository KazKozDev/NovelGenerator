import React from 'react';

/**
 * The audio studio (Drama 3) lives only on its author's machine and is not in the repository. Where its file is
 * there, this is the studio, loaded on first use; elsewhere it is null and the app shows no audio controls.
 */
export interface AudioStudioProps {
  bookKey: string;
  initialTitle?: string;
  initialChapters?: { index: number; title: string; text: string }[];
  onClose?: () => void;
  /** The Timecodes tab's content, shown as the studio's third tab. */
  timecodes?: React.ReactNode;
}

const found = import.meta.glob<{ default: React.ComponentType<AudioStudioProps> }>('./AudioStudio.tsx');
const load = found['./AudioStudio.tsx'];
const Lazy = load ? React.lazy(load) : null;

export const hasAudioStudio = !!Lazy;

const OptionalAudioStudio: React.FC<AudioStudioProps> = props =>
  Lazy ? (
    <React.Suspense fallback={<p className="text-xs text-zinc-500">Opening the audio studio…</p>}>
      <Lazy {...props} />
    </React.Suspense>
  ) : null;

export default OptionalAudioStudio;
