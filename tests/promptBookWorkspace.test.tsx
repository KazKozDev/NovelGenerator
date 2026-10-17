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
 expect(html).toContain('3. Editing');expect(html).toContain('Manuscript');expect(html).toContain('Edit text');expect(html).toContain('Current live prose 2.');expect(html).toMatch(/Save(?: Draft)? ▾/);expect(html).not.toContain('Finish writing all chapters');
 expect(html).not.toContain('Start new draft');
 expect(html).not.toContain('Back to project settings');
 expect(html).not.toContain('Open editing');
});
