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
          placeholder="Enter a paragraph describing your story idea (e.g., A young wizard discovers a hidden prophecy that could save or destroy their magical world...)"
          rows={5}
          required
          maxLength={1200} 
          className="bg-slate-700 border-slate-600 focus:ring-sky-500 focus:border-sky-500"
        />
        <p className="text-xs text-slate-400 mt-1">Max 1200 characters. Be descriptive!</p>
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
           <p className="text-xs text-slate-400 mt-1">Minimum {MIN_CHAPTERS} chapters.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading || !storyPremise || numChapters < MIN_CHAPTERS} variant="primary">
          {isLoading ? 'Weaving Your Tale...' : 'Start Weaving'}
        </Button>
      </div>
       <div className="mt-4 p-4 border border-sky-700 bg-sky-900/30 rounded-md text-sm text-slate-300">
        <h4 className="font-semibold text-sky-400 mb-2">How it Works:</h4>
        <ol className="list-decimal list-inside space-y-1.5">
            <li><strong>Story Planning:</strong> Enter your story idea, choose genre, and set desired chapter count.</li>
            <li><strong>Outline Generation:</strong> AI generates a detailed story outline and chapter-by-chapter plan.</li>
            <li><strong>Review & Approve:</strong> You review and can edit the outline before proceeding.</li>
            <li><strong>Chapter Writing:</strong> Each chapter is written with individual editing and consistency checks.</li>
            <li><strong>Final Editing Pass:</strong> All chapters are reviewed together for continuity and flow.</li>
            <li><strong>Professional Polish:</strong> Final refinement focused on rhythm, subtext, and emotional depth.</li>
            <li><strong>Book Compilation:</strong> Your complete, publication-ready book draft is presented!</li>
        </ol>
        <p className="mt-3 text-xs text-slate-400">
          <strong>⏱️ Time estimate:</strong> Generation can take several minutes, especially for more chapters. 
          Each chapter goes through multiple AI editing passes for professional quality. Please be patient.
        </p>
      </div>
    </form>
  );
};

export default UserInput;
