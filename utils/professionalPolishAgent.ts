/**
 * Professional Polish Agent - Final pass focused on making text read like a professional novel
 * This is the last editing step before compilation
 */

import { generateGeminiText } from '../services/geminiService';
import { ChapterData, AgentLogEntry } from '../types';

export interface ProfessionalPolishResult {
  polishedChapters: ChapterData[];
  totalChanges: number;
}

/**
 * Applies professional polish to all chapters
 * Focuses on rhythm, subtext, motivation, variety, emotional anchors, and perception layers
 */
export async function applyProfessionalPolish(
  chapters: ChapterData[],
  onProgress?: (current: number, total: number) => void,
  onLog?: (entry: AgentLogEntry) => void
): Promise<ProfessionalPolishResult> {
  
  const polishedChapters: ChapterData[] = [];
  let totalChanges = 0;
  
  console.log('✨ Starting professional polish pass...');
  
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const chapterNum = i + 1;
    
    if (onProgress) {
      onProgress(chapterNum, chapters.length);
    }
    
    console.log(`\n✨ Professional polish: Chapter ${chapterNum}/${chapters.length}`);
    
    // Log start
    if (onLog) {
      onLog({
        timestamp: Date.now(),
        chapterNumber: chapterNum,
        type: 'execution',
        message: `Applying professional polish to Chapter ${chapterNum}`,
        details: { phase: 'professional-polish' }
      });
    }
    
    const originalContent = chapter.content;
    
    // Apply professional polish
    const polishedContent = await polishChapterProfessionally(
      originalContent,
      chapterNum,
      chapters.length
    );
    
    // Check if changes were made
    const hasChanges = polishedContent !== originalContent;
    
    if (hasChanges) {
      totalChanges++;
      
      // Log diff
      if (onLog) {
        onLog({
          timestamp: Date.now(),
          chapterNumber: chapterNum,
          type: 'diff',
          message: `Professional polish applied to Chapter ${chapterNum}`,
          beforeText: originalContent,
          afterText: polishedContent,
          strategy: 'professional-polish'
        });
      }
    }
    
    const polishedChapter: ChapterData = {
      ...chapter,
      content: polishedContent
    };
    
    polishedChapters.push(polishedChapter);
    
    console.log(`✅ Chapter ${chapterNum} professionally polished ${hasChanges ? '(changes applied)' : '(no changes needed)'}`);
  }
  
  console.log(`\n🎉 Professional polish complete! ${totalChanges} chapters modified.`);
  
  return {
    polishedChapters,
    totalChanges
  };
}

/**
 * Applies professional-level polish to a single chapter
 */
async function polishChapterProfessionally(
  content: string,
  chapterNumber: number,
  totalChapters: number
): Promise<string> {
  
  const polishPrompt = `Ты профессиональный редактор-стилист. Твоя задача — взять готовый текст главы и отшлифовать его так, чтобы он читался как профессиональный роман.

**ГЛАВА ${chapterNumber} из ${totalChapters}:**

${content}

---

**ТВОИ ИНСТРУКЦИИ ПО ШЛИФОВКЕ:**

**1. ТЕМП И РИТМ**
- Разбивай длинные абзацы (больше 5-6 предложений)
- Чередуй описания с короткими эмоциональными ударами (1-2 предложения)
- Варьируй длину предложений для создания ритма
- Используй короткие абзацы для напряжённых моментов

**2. ДИАЛОГИ С ПОДТЕКСТОМ**
- Избавляйся от прямых объяснений в диалогах
- Добавляй паузы, жесты, недосказанность
- Пусть персонажи редко говорят всё прямо
- Показывай невербальное: взгляды, молчание, тон
- Убирай экспозицию из диалогов ("Как ты знаешь, Боб...")

**3. МОТИВАЦИЯ И СОМНЕНИЯ**
- В ключевых решениях вставляй внутреннюю борьбу
- Показывай сомнения, воспоминания, страх перед выбором
- Не переходи мгновенно к действию — дай персонажу подумать
- Покажи цену решения ДО того, как оно принято

**4. АНТИ-ПОВТОР**
- Убирай одинаковые слова в соседних абзацах
- Для повторяющихся понятий (мрак, тьма, огонь, страх) используй разнообразные метафоры
- Варьируй синонимы
- Не повторяй одну и ту же конструкцию предложений подряд

**5. ЭМОЦИОНАЛЬНЫЕ ЯКОРЯ**
- В каждой важной сцене оставляй маленький "человеческий момент"
- Воспоминание, запах, жест, деталь, которая связывает читателя с героем
- Сенсорные детали: не только зрение, но и звук, запах, осязание
- Один конкретный образ лучше трёх абстрактных

**6. СЛОИ ВОСПРИЯТИЯ**
- Показывай разницу между тем, что персонаж видит и как он это интерпретирует
- Лёгкий оттенок самообмана или предвзятости
- Субъективность восприятия: один видит угрозу, другой — возможность
- Внутренний монолог может противоречить действиям

**7. ФИНАЛЬНАЯ ШЛИФОВКА**
- Подбирай более богатую и разнообразную лексику
- Избегай клише и избитых фраз
- Сохраняй единый стиль на протяжении всей главы
- Делай текст плавным, без резких стыков между сценами
- Проверь, что переходы между абзацами логичны

**ВАЖНО:**
- Сохраняй все сюжетные события и диалоги
- Не меняй смысл сцен
- Не добавляй новые сцены или персонажей
- Фокусируйся на КАЧЕСТВЕ ПОДАЧИ, а не на содержании
- Это финальная шлифовка, а не переписывание

**ВЕРНИ:**
Отшлифованную версию главы. Только текст главы, без комментариев.`;

  const systemPrompt = `Ты мастер-редактор, специализирующийся на финальной шлифовке художественных текстов. Твоя задача — превратить хороший текст в профессиональный роман через работу с ритмом, подтекстом, эмоциональными якорями и слоями восприятия.`;

  try {
    const polished = await generateGeminiText(
      polishPrompt,
      systemPrompt,
      undefined,
      0.7, // Higher temperature for creative polish
      0.9,
      40
    );
    
    // Validation: polished text should be similar length (within 40%)
    const lengthRatio = polished.length / content.length;
    if (lengthRatio < 0.6 || lengthRatio > 1.4) {
      console.warn(`Professional polish changed length significantly (${lengthRatio.toFixed(2)}x) for chapter ${chapterNumber}. Using original.`);
      return content;
    }
    
    return polished;
  } catch (e) {
    console.warn(`Professional polish failed for chapter ${chapterNumber}:`, e);
    return content;
  }
}
