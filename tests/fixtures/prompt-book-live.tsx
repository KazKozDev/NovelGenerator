// Real App + real model. Autosave is isolated in this browser's sessionStorage;
// the user's repository autosave is never read or written by this fixture.
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../../App';
const savedKey='prompt-book-live-snapshot';
const originalFetch=window.fetch.bind(window);
(window as any).__planningCalls=[];
window.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input instanceof Request?input.url:input.toString();
 if(url.includes('/api/project-autosave')){
  if(init?.method==='PUT'){
   const snapshot=JSON.parse(String(init.body));sessionStorage.setItem(savedKey,JSON.stringify(snapshot));
   return new Response(JSON.stringify({savedAt:Date.now()}),{headers:{'Content-Type':'application/json'}});
  }
  return new Response(JSON.stringify({snapshot:JSON.parse(sessionStorage.getItem(savedKey)||'null'),recoveries:[]}),{headers:{'Content-Type':'application/json'}});
 }
 if(url.includes('/api/ollama/api/chat'))(window as any).__planningCalls.push(JSON.parse(String(init?.body)));
 return originalFetch(input,init);
};
if(!sessionStorage.getItem('prompt-book-live-initialized')){
 localStorage.setItem('novelGenerator_llm_config',JSON.stringify({provider:'ollama',ollamaModel:'deepseek-v4.1-flash:cloud',ollamaEndpoint:'http://127.0.0.1:3017/api/ollama'}));
 localStorage.setItem('novelGenerator_main_form',JSON.stringify({premise:'В небольшом приморском городе смотрительница маяка обнаруживает, что расписание сигналов изменяли без её ведома. Она должна выяснить причину, не подставив брата, который подменял её в ночную смену. История о доверии и ответственности, без мистики. Финал: она устанавливает правду и сохраняет отношения с братом, признав собственную ошибку.',chapters:4,title:'Чужая смена'}));
 localStorage.setItem('novelGenerator_story_settings',JSON.stringify({genre:'thriller',targetWordsPerChapter:3000,narrativeVoice:'third-limited',tense:'past',tone:'restrained',writingStyle:'concrete, dialogue-driven',ending:'closed',targetAudience:'adult'}));
 sessionStorage.setItem('prompt-book-live-initialized','1');
}
async function mount(){
 if(new URLSearchParams(location.search).has('actions')&&!sessionStorage.getItem('prompt-actions-seeded')){const {actionSeed}=await import('./prompt-actions-seed');sessionStorage.setItem(savedKey,JSON.stringify(actionSeed(new URLSearchParams(location.search).has('editing'))));sessionStorage.setItem('prompt-actions-seeded','1');}
 createRoot(document.getElementById('root')!).render(<App/>);
}
void mount();
