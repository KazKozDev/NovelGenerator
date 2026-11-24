import React from 'react';
import {it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import UserInput from '../components/UserInput';
import PromptBookWorkspace from '../components/PromptBookWorkspace';
import type {PromptBook} from '../utils/novel/promptBook';
it('main-page planning mode offers prompt preparation without reader controls and accepts 3000 words',()=>{
 const html=renderToStaticMarkup(<UserInput planningOnly bookTitle="My title" setBookTitle={vi.fn()} storyPremise="A missing log" setStoryPremise={vi.fn()} numChapters={4} setNumChapters={vi.fn()} genre="thriller" setGenre={vi.fn()} storySettings={{targetWordsPerChapter:3000}} setStorySettings={vi.fn()} onSubmit={vi.fn()} isLoading={false}/>);
 expect(html).not.toMatch(/[А-Яа-яЁё]/);expect(html).toContain('Writing style');expect(html).toContain('Style instructions');expect(html).toContain('Prose samples');expect(html).toContain('Create outline and chapter prompts');expect(html).not.toContain('Reader model');expect(html).not.toContain('Watch live in studio');expect(html).toContain('step="1"');expect(html).toContain('value="My title"');
});
it('a changed plan exposes stale prompts and disables their combined download',()=>{
 const state:PromptBook={version:1,brief:{input:{premise:'A log',chapter_count:4,target_total_words:12000,genre:'thriller',author_requirements:'past'},settings:{}},phase:'prompts',revision:2,prompts:[{chapter:1,title:'One',system:'Rules',prompt:'Draft this',sourceRevision:1}],updatedAt:''};
 const html=renderToStaticMarkup(<PromptBookWorkspace value={state} busy={false} onContinue={vi.fn()} onSaveBlueprint={vi.fn()} onSavePrompt={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()}/>);
 expect(html).toContain('Outline changed');expect(html).toContain('Outdated after outline change');expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Download all prompts/);
});
it('orders chapter navigation and puts the optional review result in the left sidebar',()=>{
 const state:PromptBook={version:1,brief:{input:{premise:'Story',chapter_count:2,target_total_words:6000,genre:'thriller',author_requirements:''},settings:{}},phase:'ready',revision:1,prompts:[2,1].map(chapter=>({chapter,title:`Title ${chapter}`,system:'Rules',prompt:'A full prompt',sourceRevision:1})),updatedAt:'',reviews:[{createdAt:'2026-10-17T00:00:00Z',chapters:[1,2],signature:'old',summary:'Only these two chapters were checked',findings:[]}]};
 const html=renderToStaticMarkup(<PromptBookWorkspace value={state} busy={false} onContinue={vi.fn()} onSaveBlueprint={vi.fn()} onSavePrompt={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onCheck={vi.fn()}/>);
 expect(html).not.toMatch(/[А-Яа-яЁё]/);
 const sidebar=html.slice(html.indexOf('<aside'),html.indexOf('</aside>'));
 expect(sidebar.indexOf('1. Title 1')).toBeLessThan(sidebar.indexOf('2. Title 2'));
 expect(sidebar).toContain('Only these two chapters were checked');expect(sidebar).toContain('Review is outdated');expect(html).toContain('Chapter prompt 1');
});
it('restores the third editing stage with the existing editorial studio and live manuscript',()=>{
 const state:PromptBook={version:1,brief:{input:{premise:'Save a log',chapter_count:2,target_total_words:1200,genre:'thriller',author_requirements:'Past tense'},settings:{}},phase:'ready',revision:1,prompts:[],workspaceStage:'editing',story:{revision:1,chapters:[1,2].map(chapter=>({chapter,title:`Chapter ${chapter}`,text:`Current live prose ${chapter}.`,system:'Write',prompt:'Write',createdAt:''}))},updatedAt:''};
 const html=renderToStaticMarkup(<PromptBookWorkspace value={state} busy={false} onContinue={vi.fn()} onSaveBlueprint={vi.fn()} onSavePrompt={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} onSaveStory={vi.fn()}/>);
 expect(html).toContain('3. Editing');expect(html).toContain('Manuscript');expect(html).toContain('Edit text');expect(html).toContain('Current live prose 2.');expect(html).toContain('5. Publish');expect(html).not.toMatch(/Export(?: draft)? ▾/);
 // The cover and edition fields live on the Cover and Publish stages, not beside the manuscript.
 expect(html).not.toContain('Upload book cover');expect(html).not.toContain('imprint-edition-input');expect(html).not.toContain('Finish writing all chapters');
 expect(html).not.toContain('Start new draft');
 expect(html).not.toContain('Back to project settings');
 expect(html).not.toContain('Open editing');
});
it('the publish stage gives each store its files and checks, and keeps the app formats without a backup button',()=>{
 const state:PromptBook={version:1,brief:{input:{title:'The Log',premise:'Save a log',chapter_count:1,target_total_words:1200,genre:'thriller',author_requirements:''},settings:{}},phase:'ready',revision:1,prompts:[],workspaceStage:'publish',story:{revision:1,chapters:[{chapter:1,title:'Chapter 1',text:'The log was gone.',system:'Write',prompt:'Write',createdAt:''}]},updatedAt:''} as unknown as PromptBook;
 const html=renderToStaticMarkup(<PromptBookWorkspace value={state} busy={false} onContinue={vi.fn()} onSaveBlueprint={vi.fn()} onSavePrompt={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} publication={{author:'A. Writer'}}/>);
 for(const store of ['Amazon Kindle','Apple Books','Google Play Books'])expect(html).toContain(`Prepare for ${store}`);
 expect(html).toContain('Cover JPEG 1600×2560');expect(html).toContain('needs a cover');
 expect(html).toContain('>Edition<');expect(html).toContain('First edition');expect(html).toContain('Markdown');expect(html).not.toContain('Project backup');expect(html).not.toContain('Reading EPUB');
 // The folder name is the only Russian on the page: the interface itself is English.
 expect(html.replaceAll('издания/','')).not.toMatch(/[А-Яа-яЁё]/);
});
