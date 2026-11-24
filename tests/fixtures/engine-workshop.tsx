// Isolated UI proof: never opens a project store or calls a text-generation model.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import UserInput from '../../components/UserInput';
import type { StorySettings } from '../../types';
import { buildProjectInput, DEFAULT_GENERATION_SETTINGS } from '../../utils/generationSettings';
function Workshop() {
  const [premise, setPremise] = useState('An archivist must expose a forged ledger before a hearing.');
  const [chapters, setChapters] = useState(3);
  const [genre, setGenre] = useState('thriller');
  const [settings, setSettings] = useState<StorySettings>({ ...DEFAULT_GENERATION_SETTINGS, genre: 'thriller' });
  const [built, setBuilt] = useState('No input submitted.');
  return <><h1>Isolated author-engine settings</h1><p role="status">No project changes or model generation.</p><UserInput storyPremise={premise} setStoryPremise={setPremise} numChapters={chapters} setNumChapters={setChapters} genre={genre} setGenre={setGenre} storySettings={settings} setStorySettings={setSettings} isLoading={false} onSubmit={() => setBuilt(JSON.stringify(buildProjectInput(premise, chapters, settings), null, 2))} /><section><h2>Built engine input</h2><pre id="built-input">{built}</pre></section></>;
}
createRoot(document.getElementById('root')!).render(<Workshop />);
