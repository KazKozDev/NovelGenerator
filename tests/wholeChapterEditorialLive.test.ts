import {it,expect} from 'vitest';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {generateOllamaText} from '../services/ollamaService';
import {runEditorialTurn} from '../utils/novel/editorialAgent';
import {applySearchReplacePatch} from '../utils/novel/patchApplier';
it.skipIf(process.env.NOVEL_LIVE_CHAPTER_EDITORIAL!=='1')('edits the actual chapter through the production editorial agent',async()=>{
 const directory='runs/whole-chapter-editorial-core-contract-2026-10-16';
 await mkdir(directory,{recursive:true});
 const original=await readFile('runs/whole-chapter-3000-core-contract-2026-10-16/chapter.md','utf8');
 const bookContent=original.replace(/^# .*\n/,'## Глава 1\n');
 const plan=await readFile('runs/whole-chapter-3000-core-contract-2026-10-16/source-plan.json','utf8');
 const userPrompt=`Исправь главу 1 исполнимыми правками propose_diff. Исправь ВСЕ перечисленные замечания, сохрани цельную главу и удачные фрагменты. Не заявляй исправления без патчей.
1. Покажи съёмку журнала, ящика с маркировкой и пломбой, накладной на телефон Норы ДО возвращения оригиналов: сейчас фото появляются в галерее без действий.
2. Устрани противоречие принимающего в накладной: в начале Илья говорит, что подписала Нора, позже указан кладовщик. Сохрани принимающим кладовщика; акт подписала Нора заранее.
3. Илья установил предел 17:35, но ждёт до 17:41. Пусть уйдёт наверх не позже своего предела; финальный выбор Нора делает без него, не возвращай его для заключительного разговора.
4. Покажи безопасное размещение и возвращение пакета при работе с решёткой: он передан Норе, обе её руки заняты, затем пакет необъяснимо оказывается на плече Ильи.
5. Явно покажи выбор инспектора адресатом перед отправкой сообщения.
6. Исправь she, courier, спроил и другие очевидные языковые сбои.
7. Заверши текст сразу подтверждением доставки полного сообщения. Удали весь разговор и остаток после доставки.
8. Устрани несогласованную географию: в начале насос оказывается за запертой решёткой, которую открывают лишь после его осмотра. Насос доступен до решётки архива; решётка закрывает только архив.
9. Воспоминание об акте утром 12 апреля противоречит доставке узла в 14:20 при словах мастера «почти закончена». Согласуй время предварительной подписи после доставки, до обещанного окончания к вечеру.
Не наращивай объём ради 3000 слов в этой редактуре. Сократи повторные разъяснения вины там, где смысл уже показан действием. Не смягчай сознательную предварительную подпись Норы до обмана о якобы завершённой работе. Не добавляй улик и виновников.
Исходная карточка для сверки фактов:\n${plan}`;
 await writeFile(`${directory}/tasks.md`,userPrompt);
 const calls:any[]=[];
 const result=await runEditorialTurn({userPrompt,bookContent,history:[],provider:'ollama',callModel:async(prompt,system)=>{
  const start=Date.now();
  await writeFile(`${directory}/request-${calls.length+1}.json`,JSON.stringify({prompt,system,model:'deepseek-v4.1-flash:cloud',temperature:0.2,maxTokens:16000},null,2));
  const response=await generateOllamaText(prompt,system,undefined,0.2,'deepseek-v4.1-flash:cloud','http://127.0.0.1:3017/api/ollama',16000);
  calls.push({durationMs:Date.now()-start,response});
  return response;
 }});
 let edited=bookContent; const applications=[];
 for(const card of result.diffCards){
  const applied=applySearchReplacePatch(edited,card.chapterNum,card.searchTarget,card.replacementText);
  applications.push({id:card.id,success:applied.success,error:applied.error});
  if(applied.success) edited=applied.updatedManuscript;
 }
 await writeFile(`${directory}/chapter.md`,edited);
 await writeFile(`${directory}/result.json`,JSON.stringify({result,applications,calls,reviewerCalls:0,words:edited.split(/\s+/).filter(Boolean).length},null,2));
 console.log('Editor calls:',calls.length,'patches:',result.diffCards.length,'applied:',applications.filter(x=>x.success).length);
 expect(result.diffCards.length).toBeGreaterThan(0);
 expect(applications.every(x=>x.success)).toBe(true);
},240000);
