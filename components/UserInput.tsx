import React from 'react';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';
import { Input } from './common/Input';
import { Select } from './common/Select';
import { MIN_CHAPTERS } from '../constants';
import { GENRE_CONFIGS } from '../utils/genrePrompts';

interface UserInputProps {
  storyPremise: string;
  setStoryPremise: (value: string) => void;
  numChapters: number;
  setNumChapters: (value: number) => void;
  genre: string;
  setGenre: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

const UserInput: React.FC<UserInputProps> = ({
  storyPremise,
  setStoryPremise,
  numChapters,
  setNumChapters,
  genre,
  setGenre,
  onSubmit,
  isLoading,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numChapters >= MIN_CHAPTERS) {
      onSubmit();
    } else {
      alert(`Please enter at least ${MIN_CHAPTERS} chapters.`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="storyPremise" className="block text-sm font-medium text-sky-300 mb-1">
          Story Premise
        </label>
        <TextArea
          id="storyPremise"
          value={storyPremise}
          onChange={(e) => setStoryPremise(e.target.value)}
          placeholder="Enter a paragraph describing your story idea (e.g., A detective uncovers a conspiracy that threatens everything they believe in...)"
          rows={5}
          required
          maxLength={1200} 
          className="bg-slate-700 border-slate-600 focus:ring-sky-500 focus:border-sky-500"
        />
        <p className="text-xs text-slate-400 mt-1">Max 1200 characters. Be descriptive</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="genre" className="block text-sm font-medium text-sky-300 mb-1">
            Genre
          </label>
          <Select
            id="genre"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="bg-slate-700 border-slate-600 focus:ring-sky-500 focus:border-sky-500"
          >
            {Object.entries(GENRE_CONFIGS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name} - {config.description}
              </option>
            ))}
          </Select>
          <p className="text-xs text-slate-400 mt-1">Choose your story genre</p>
        </div>

        <div>
          <label htmlFor="numChapters" className="block text-sm font-medium text-sky-300 mb-1">
            Number of Chapters
          </label>
          <Input
            id="numChapters"
            type="number"
            value={numChapters}
            onChange={(e) => setNumChapters(Math.max(MIN_CHAPTERS, parseInt(e.target.value, 10) || MIN_CHAPTERS))}
            min={MIN_CHAPTERS}
            required
            className="bg-slate-700 border-slate-600 focus:ring-sky-500 focus:border-sky-500"
          />
           <p className="text-xs text-slate-400 mt-1">Minimum {MIN_CHAPTERS} chapters</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading || !storyPremise || numChapters < MIN_CHAPTERS} variant="primary">
          {isLoading ? 'Weaving Your Tale...' : 'Start Weaving'}
        </Button>
      </div>
       <div className="mt-12 pt-12 border-t border-slate-700 space-y-8 text-slate-300">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300 mb-2">
            How to begin
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">01. Start with your vision</h3>
            <p className="text-sm text-slate-400">
              Choose your genre. Set your chapter count. Share your story idea. That's all we need.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">02. Intelligence meets creativity</h3>
            <p className="text-sm text-slate-400">
              Our AI builds a complete story architecture — plot progression, character arcs, emotional beats. Every detail mapped before the first word is written.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">03. You stay in control</h3>
            <p className="text-sm text-slate-400">
              Review the outline. Refine it. Approve when it feels right. This is your story. We're just here to help bring it to life.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">04. Three specialists. One masterpiece</h3>
            <p className="text-sm text-slate-400">
              Structure. Character. Scene. Each specialized AI agent focuses on what it does best, collaborating in real-time to craft every chapter with precision.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">05. Quality built in</h3>
            <p className="text-sm text-slate-400">
              Every chapter undergoes multiple editing passes. Consistency checks. Narrative flow analysis. We catch what humans miss.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">06. The final polish</h3>
            <p className="text-sm text-slate-400">
              Rhythm. Subtext. Emotional resonance. Our pipeline refines every sentence until your story doesn't just read well — it feels right.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-sky-300">07. In your format</h3>
            <p className="text-sm text-slate-400">
              Download your manuscript in PDF, TXT, or EPUB format. Ready for sharing or further editing.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};

export default UserInput;
