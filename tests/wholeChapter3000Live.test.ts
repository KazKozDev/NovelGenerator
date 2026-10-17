import { it, expect } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateOllamaText } from '../services/ollamaService';

// Explicitly one writer call. No reviewer, continuation, retry or revision calls.
it.skipIf(process.env.NOVEL_LIVE_CHAPTER_3000!=='1')('writes a 3000-word chapter from three cards in a single real call without review',async()=>{
 const source=process.env.NOVEL_CHAPTER_3000_SOURCE||'runs/whole-chapter-three-cards-2026-10-16/source-plan.json';
 const directory=process.env.NOVEL_CHAPTER_3000_DIR||'runs/whole-chapter-3000-three-cards-2026-10-16';
 const model=process.env.NOVEL_LIVE_MODEL||'deepseek-v4.1-flash:cloud';
 const endpoint=process.env.NOVEL_LIVE_ENDPOINT||'http://127.0.0.1:3017/api/ollama';
 const input=JSON.parse(await readFile(source,'utf8'));
 if(input.format==='single_chapter_card') expect(input.chapterCard.causalSpine.length).toBeGreaterThan(0);
 else expect(input.cards).toHaveLength(3);
 await mkdir(directory,{recursive:true});
 const system='Ты пишешь реалистический психологический триллер на русском языке. Третье лицо, ограниченная точка зрения Норы, прошедшее время. План — знание автора; персонажи узнают сведения через действия в указанных эпизодах. Пиши развёрнутую литературную прозу с живым диалогом, конкретной физической причинностью и различимыми голосами. Выдай только текст главы, без заголовков сцен, комментариев, анализа и отчёта.';
 const legacyPrompt=`Напиши СРАЗУ ОДНУ ПОЛНУЮ ГЛАВУ объёмом 3000 слов по трём карточкам ниже. Это один проход: продолжения, дописывания и редакторской правки не будет. Не сокращай до краткого пересказа или главы на 1000–1500 слов. Ориентир: около 1000 слов на каждый из трёх эпизодов; общий допустимый диапазон 2850–3150 слов. Разворачивай действия, взаимодействия, препятствия и выборы внутри заданных событий, не добавляй новые сюжетные линии ради объёма.\n\nЭто единая глава с общим нарастанием напряжения и одним финалом, а не три самостоятельных рассказа. Все обязательные действия и материальные последствия карточек должны произойти на странице. Ключ, фонарь, журнал, лист инцидента, старый акт и телефон сохраняют понятное положение и владельца; переходы предметов между руками показывай естественным действием. Пройденное препятствие и уже выполненный жест не разыгрывай повторно на границах эпизодов. Сведения из будущих карточек не становятся знаниями Норы раньше их получения. Отсчёт времени согласован. Заверши главу фактической отправкой доказательства инспектору вместе с личной ценой для Норы, без нового эпилога и новой опасности после отправки.\n\nНе используй прежнюю прозу: напиши самостоятельный развёрнутый черновик по этому исходному плану. Существующие targetWords=400 в карточках относятся к старому тесту и ЗАМЕНЕНЫ заданием этого прогона: примерно 1000 слов на эпизод, 3000 слов на главу.\n\nИСХОДНЫЙ ПЛАН И ТРИ КАРТОЧКИ:\n${JSON.stringify(input)}\n\nСразу выдай всю главу на 3000 слов. Только художественный текст.`;
 const prompt=input.format==='single_chapter_card' ? `Напиши ОДНУ цельную главу приблизительно на 3000 слов (2850–3150), сразу одним проходом, на основе единой карточки ниже. Это драматическая задача всей главы, а не три независимые сцены. Сам распредели объём: не нужно равных частей или отдельных локальных финалов. Сохрани причинную цепочку, ограничения знания и состояния предметов. Окончательное решение героини должно состояться один раз, в финале; подготовка и признание до этого не являются окончательным выбором. Не используй прежние черновики. Выдай полноценную развёрнутую прозу, а не краткое исполнение пунктов плана. Без заголовков эпизодов, комментариев и эпилога.\n\nЕДИНАЯ КАРТОЧКА ГЛАВЫ:\n${JSON.stringify(input)}\n\nВыдай сразу всю главу на русском языке, около 3000 слов. Только художественный текст.` : process.env.NOVEL_CHAPTER_3000_SOURCE ? `Напиши цельную главу на 3000 слов по трём причинным карточкам ниже, сразу одним проходом, без отдельных заголовков эпизодов. Допустимый диапазон 2850–3150 слов. При ограниченном бюджете внимания не сжимай финальный эпизод: оставь около 1000 слов на каждый из трёх. Это не пересказ плана и не инструкция: разверни столкновения целей, неудачные тактики и изменения решений в конкретные действия и диалог. Не добавляй новые обстоятельства ради объёма. В повествовании показывай, а не пересказывай пункты карточек. Источник содержит исправленную причинность и физическую непрерывность. Не копируй старый черновик. Не раскрывай авторскую цепочку улик раньше, чем персонажи добудут каждое звено. После доставки не добавляй эпилог.\n\n${JSON.stringify(input)}\n\nСразу выдай всю главу приблизительно на 3000 слов. Только художественная проза.` : legacyPrompt;
 await writeFile(join(directory,'request.json'),JSON.stringify({model,source,system,prompt,temperature:0.8,maxTokens:16000,writerCalls:1,reviewerCalls:0},null,2));
 let usage:Record<string,unknown>={};const start=Date.now();
 console.log('Single writer call:',model,'target 3000 words; no reviewer.');
 const text=await generateOllamaText(prompt,system,undefined,0.8,model,endpoint,16000,undefined,undefined,undefined,value=>{usage=value;});
 const durationMs=Date.now()-start;
 await writeFile(join(directory,'chapter.md'),`# ${input.title||'Тестовая глава'}\n\n${text.trim()}\n`);
 const words=text.trim().split(/\s+/).filter(Boolean).length;
 await writeFile(join(directory,'result.json'),JSON.stringify({model,targetWords:3000,actualWords:words,durationMs,usage,writerCalls:1,reviewerCalls:0,edited:false,text},null,2));
 console.log('Saved:',directory,'actual words:',words,'generation ms:',durationMs);
 expect(text.trim().length).toBeGreaterThan(0);
},240000);
