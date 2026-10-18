import type {ProjectStore} from '../v2/store';
import {assembleManuscript,parseBookChapters} from '../manuscript';
import {savePromptBook,type PromptBook} from './index';
import type {PromptStory} from './actions';
export type PromptWorkspaceStage='prompts'|'story'|'editing'|'cover'|'publish'|'audio';
/** `session` ties the revisions of one manual editing session together: autosaves while typing keep one "before". */
export interface StoryEditRevision {at:string;before:PromptStory;session?:string}
export function canEditPromptStory(book:PromptBook):boolean {
 return !!book.story&&book.story.chapters.length===book.brief.input.chapter_count&&book.story.chapters.every((c,i)=>c.chapter===i+1&&!!c.text.trim());
}
export function promptStoryContent(book:PromptBook):string {
 return assembleManuscript(book.story?.chapters||[],book.story?.title||book.blueprint?.title||book.brief.input.title);
}
export function promptStoryMetadata(book:PromptBook) {
 return {title:book.story?.title||book.blueprint?.title||book.brief.input.title,premise:book.brief.input.premise,genre:book.brief.input.genre,
  author_requirements:[book.brief.input.author_requirements,book.style?.profile?`Shared writing style:\n${book.style.profile}`:''].filter(Boolean).join('\n\n'),
  dossier:book.blueprint,chapters:(book.story?.chapters||[]).map(c=>({chapter:c.chapter,words:c.text.split(/\s+/).filter(Boolean).length}))};
}
export function setPromptWorkspaceStage(store:ProjectStore,stage:PromptWorkspaceStage) {
 const book=store.loadAuthor()?.promptPlanning;if(!book)throw new Error('Prompt project not found.');
 if(!['prompts','story','editing','cover','publish','audio'].includes(stage))throw new Error('Unknown workspace stage.');
 if(stage==='editing'&&!canEditPromptStory(book))throw new Error('Finish writing all chapters before opening the editing stage.');
 book.workspaceStage=stage;savePromptBook(store,book);return book;
}
/** The prompt-story draft remains the sole source of truth for this workflow. */
export function savePromptStoryManuscript(store:ProjectStore,content:string,expectedContent?:string,session?:string) {
 const book=store.loadAuthor()?.promptPlanning;
 if(!book||!canEditPromptStory(book))throw new Error('The complete story is not available for editing.');
 if(expectedContent!==undefined&&expectedContent!==promptStoryContent(book))throw new Error('The story changed while this edit was prepared. Reopen it and apply the change again.');
 if(content===promptStoryContent(book))return book;
 const parsed=parseBookChapters(content);
 if(parsed.length!==book.brief.input.chapter_count||parsed.some((c,i)=>c.num!==i+1||!c.content.trim()))throw new Error('Keep every numbered chapter, in order, with nonempty text. The previous story was retained.');
 const title=content.match(/^#[ \t]+([^\r\n]+)/m)?.[1].trim()||book.story!.title||book.blueprint?.title;
 const next={...book.story!,title,chapters:book.story!.chapters.map((c,i)=>({...c,text:parsed[i].content}))};
 if(JSON.stringify(next)===JSON.stringify(book.story))return book;
 const last=book.storyEdits?.at(-1);
 if(session&&last?.session===session){
  // The same editing session again: keep its first "before", and drop it when the text is back to that.
  book.storyEdits=JSON.stringify(next)===JSON.stringify(last.before)?book.storyEdits!.slice(0,-1):book.storyEdits;
  book.story=next;book.workspaceStage='editing';savePromptBook(store,book);return book;
 }
 book.storyEdits=[...(book.storyEdits||[]).slice(-19),{at:new Date().toISOString(),before:structuredClone(book.story!),...(session?{session}:{})}];
 book.story=next;book.workspaceStage='editing';savePromptBook(store,book);store.log('story-edit','Saved manuscript edit; previous revision retained.');return book;
}
