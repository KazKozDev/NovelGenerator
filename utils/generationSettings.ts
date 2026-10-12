import type { StorySettings } from '../types';
import type { ProjectInput } from './novel/v2/types';
export const MAIN_FORM_KEY='novelGenerator_main_form';
export const DEFAULT_GENERATION_SETTINGS:StorySettings={genre:'fantasy',narrativeVoice:'third-limited',tone:'serious',targetAudience:'adult',writingStyle:'descriptive',tense:'past',ending:'closed',intimacy:'on the page, not faded out',targetWordsPerChapter:4000};
export const GENERATION_SETTINGS_KEY='novelGenerator_story_settings';
export const DEFAULT_WORDS_PER_CHAPTER=4000;
export function getWordsPerChapter():number {
  try { const value=JSON.parse(localStorage.getItem(GENERATION_SETTINGS_KEY)||'{}').targetWordsPerChapter;
    return Number.isSafeInteger(value)&&value>0?value:DEFAULT_WORDS_PER_CHAPTER;
  }catch{return DEFAULT_WORDS_PER_CHAPTER;}
}
export function readGenerationSettings(fallback:StorySettings):StorySettings {
  try { return {...fallback,...JSON.parse(localStorage.getItem(GENERATION_SETTINGS_KEY)||'{}'),targetWordsPerChapter:getWordsPerChapter()}; }
  catch{return fallback;}
}
export function saveGenerationSettings(settings:StorySettings){try{localStorage.setItem(GENERATION_SETTINGS_KEY,JSON.stringify(settings))}catch{}}
export function readMainForm():{premise:string;chapters:number} {
  try{const value=JSON.parse(localStorage.getItem(MAIN_FORM_KEY)||'{}');return {premise:typeof value.premise==='string'?value.premise:'',chapters:Number.isInteger(value.chapters)&&value.chapters>=3&&value.chapters<=100?value.chapters:3};}
  catch{return {premise:'',chapters:3};}
}
export function saveMainForm(premise:string,chapters:number){try{localStorage.setItem(MAIN_FORM_KEY,JSON.stringify({premise,chapters}))}catch{}}
export function buildProjectInput(premise:string,chapters:number,settings:StorySettings):ProjectInput {
  const words=settings.targetWordsPerChapter||DEFAULT_WORDS_PER_CHAPTER;
  if(!premise.trim())throw new Error('Fill in Story premise on the main page.');
  if(!Number.isSafeInteger(chapters)||chapters<3||chapters>100)throw new Error('Set Number of Chapters between 3 and 100.');
  if(!Number.isSafeInteger(words)||words<1)throw new Error('Set a positive Target words per chapter.');
  return {planning_version:2,premise,chapter_count:chapters,genre:settings.genre||'fantasy',target_total_words:words*chapters,author_requirements:[
    settings.narrativeVoice?`Voice: ${settings.narrativeVoice}.`:'',settings.tone?`Tone: ${settings.tone}.`:'',
    settings.writingStyle?`Style: ${settings.writingStyle}.`:'',settings.targetAudience?`Audience: ${settings.targetAudience}.`:'',
    settings.tense?`Tense: ${settings.tense}.`:'',settings.ending?`Ending: ${settings.ending}.`:'',
    settings.intimacy?`Intimate scenes: ${settings.intimacy}.`:'',
  ].filter(Boolean).join(' ')||'(none)'};
}
