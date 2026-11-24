import {it,expect} from 'vitest';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {generateOllamaText} from '../services/ollamaService';
it.skipIf(process.env.NOVEL_LIVE_DIRECT_EXPERIMENT!=='1')('compares compact chapter prompts without editors',async()=>{
 const dir='runs/direct-chapter-experiments-2026-10-16';await mkdir(dir,{recursive:true});
 const baseline=JSON.parse(await readFile('runs/direct-chapter-no-editors-2026-10-16/request.json','utf8'));
 const story=`Один ключ до отключения. Реалистический психологический триллер. 14 апреля, 17:05, затопленная насосная станция. В 17:45 диспетчер обязан отключить аварийный насос. Нора — сотрудница станции. 12 апреля она сознательно подписала акт о выполненной и проверенной замене узла заранее: мастер обещал закончить к вечеру. Она не проверяла работу. Сейчас она хочет разобраться в несоответствии, сохранив себя вне обвинения. Илья — курьер: хочет доказать доставку, не отвечать за монтаж и уйти безопасно. Его накладная в сухом пакете; принимающим в ней указан мастер. У Ильи налобный фонарь, у Норы телефон с камерой. На старте руки Норы целы.
Архив расположен выше затопленного прохода, его пол и полки сухие. Работающий насос доступен перед решёткой архива. У входной лестницы шкафчик с ключом и журналом выдачи, у архивной решётки монтажный рычаг. В архиве нет сети, у входной лестницы она есть.
Глава развивается одной причинной цепочкой:
1. Герои договариваются: Илья должен уйти наверх не позже 17:35. Нора записывает текущую выдачу ключа на своё имя. По дороге она впервые читает на действующем насосе А204 и фотографирует табличку с общим видом агрегата.
2. Ключ открывает навесной замок архива; отдельно приходится преодолеть перекос решётки рычагом. Здесь Нора повреждает правую ладонь и далее пользуется телефоном левой. Рычаг остаётся распоркой открытого прохода. Илья перед работой руками ставит пакет на сухое место, затем забирает.
3. В архиве Нора впервые читает журнал: 12 апреля А204 демонтирован и списан, установлен Б417. Они допускают ошибку записи и проверяют ящик Б417: заводская пломба цела. Накладная подтверждает доставку этого ящика, не монтаж. До осмотра герои не знают состояния ящика. Нора снимает на свой телефон запись журнала, маркировку и пломбу ящика, накладную.
4. Там же она находит акт той работы со своей подписью без оговорки о предварительном подписании. Фотографирует его, признаётся Илье, что подписала заранее. Между ними возникает трудный разговор: у каждого своя ответственность. Признание и съёмка ещё не означают, что она решилась предъявить акт инспектору.
5. Журнал и акт возвращаются на сухую полку, накладная — Илье в пакет. Через уже открытый проход они возвращаются к входной лестнице. Илья уходит наверх до 17:35; Нора остаётся с телефоном, оригиналы и запломбированный ящик остаются в архиве.
6. У лестницы есть сеть. Нора ещё может отправить только чужие несоответствия. Единственный окончательный выбор — включить собственный акт и признание предварительной подписи в полное сообщение инспектору. Она отправляет его и видит доставку до 17:45. Последнее событие главы — эта доставка.
Самостоятельно строй тактики, столкновения интересов и живой диалог внутри этих событий. Поддерживай ясные места, время и обращение с предметами. Персонажи узнают новые факты при осмотре. Набор улик показывает несоответствие записи физическому состоянию; личности всех виновных и мотивы ещё не установлены. Развивай материал через неудачные попытки и трудные решения, не повторяя объяснения вины. Русский язык, третье лицо с ограниченной точкой зрения Норы, прошедшее время. Около 3000 слов, ориентир 2850–3150. Выдай только цельную художественную главу.`;
 const ending=`\n\nОпорные условия последнего отрезка: к 17:35 Илья уже ушёл наверх. Нора одна у входной лестницы. На её телефоне есть сделанные на странице фотографии работающего А204, записи журнала, закрытого ящика Б417 с целой пломбой, накладной и акта. Адресат сообщения — инспектор. Окончательный выбор о включении собственного акта происходит здесь. Последняя фраза фиксирует доставку сообщения до 17:45; это конец главы.`;
 const arms=[{id:'compact',prompt:story},{id:'compact-ending',prompt:story+ending}];
 await writeFile(`${dir}/design.json`,JSON.stringify({model:baseline.model,temperature:0.8,maxTokens:16000,replicates:2,arms,baselineSources:['runs/whole-chapter-3000-core-contract-2026-10-16','runs/direct-chapter-no-editors-2026-10-16'],note:'Baseline historical samples. New arms use same prose plan; ending arm repeats existing final constraints. One writer call per sample, no reviewers, retries or edits. One story only; manual unblinded assessment.'},null,2));
 for(let sample=1;sample<=2;sample++)for(const arm of sample===1?arms:[...arms].reverse()){
  const path=`${dir}/${arm.id}-${sample}`;await mkdir(path,{recursive:true});
  const request={model:baseline.model,system:baseline.system,prompt:arm.prompt,temperature:0.8,maxTokens:16000};
  await writeFile(`${path}/request.json`,JSON.stringify(request,null,2));
  let text='',usage:Record<string,unknown>={};const start=Date.now();
  console.log('Starting',arm.id,sample);
  try{
   text=await generateOllamaText(request.prompt,request.system,undefined,request.temperature,request.model,'http://127.0.0.1:3017/api/ollama',request.maxTokens,undefined,undefined,chunk=>{text+=chunk;},meta=>{usage=meta;});
   await writeFile(`${path}/chapter.md`,text.trim()+'\n');
   await writeFile(`${path}/result.json`,JSON.stringify({status:'complete',words:text.trim().split(/\s+/).length,durationMs:Date.now()-start,usage,writerCalls:1,reviewerCalls:0},null,2));
   console.log('Completed',arm.id,sample,text.trim().split(/\s+/).length,'words');
  }catch(error){await writeFile(`${path}/partial.md`,text);await writeFile(`${path}/result.json`,JSON.stringify({status:'failed',error:String(error),durationMs:Date.now()-start,usage},null,2));throw error;}
 }
 expect(arms).toHaveLength(2);
},900000);
