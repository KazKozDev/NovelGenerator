import React, { useMemo } from 'react';

interface BookStatisticsProps {
  bookContent: string;
  metadata: any;
}

const BookStatistics: React.FC<BookStatisticsProps> = ({ bookContent, metadata }) => {
  const stats = useMemo(() => {
    // Calculate word count
    const words = bookContent.trim().split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length;
    
    // Calculate character count (without spaces)
    const characters = bookContent.replace(/\s/g, '').length;
    
    // Calculate reading time (average 200 words per minute)
    const readingTimeMinutes = Math.ceil(totalWords / 200);
    
    // Get chapter count (supports English "Chapter 1", Russian "Глава 1", or numbered headers)
    const chapterMatches = bookContent.match(/^(?:##?\s+(?:Chapter|Глава)\s+\d+|##?\s+\d+[\.\:]\s+|##\s+[^\r\n]+)/gim);
    const chapterCount = chapterMatches ? chapterMatches.length : (metadata?.chapters_count || 0);
    
    // Calculate average words per chapter
    const avgWordsPerChapter = chapterCount > 0 ? Math.round(totalWords / chapterCount) : 0;
    
    // Calculate dialogue ratio (count lines with quotes or direct speech dashes)
    const dialogueLines = bookContent.split('\n').filter(line => {
      const trimmed = line.trim();
      return (
        trimmed.startsWith('—') ||
        trimmed.startsWith('–') ||
        trimmed.startsWith('- ') ||
        line.includes('"') ||
        line.includes('«') ||
        line.includes('»') ||
        line.includes('“') ||
        line.includes('”')
      );
    }).length;
    const totalLines = bookContent.split('\n').filter(line => line.trim().length > 0).length;
    const dialogueRatio = totalLines > 0 ? Math.round((dialogueLines / totalLines) * 100) : 0;
    
    // Get tension levels from metadata
    const emotionalArc = metadata?.emotional_arc_by_chapter || {};
    const tensionLevels = Object.values(emotionalArc).map((entry: any) => 
      typeof entry.tensionLevel === 'number' ? entry.tensionLevel : parseInt(entry.tensionLevel) || 5
    );
    const avgTension = tensionLevels.length > 0 
      ? (tensionLevels.reduce((a: number, b: number) => a + b, 0) / tensionLevels.length).toFixed(1)
      : '5.0';
    
    return {
      totalWords,
      characters,
      readingTimeMinutes,
      chapterCount,
      avgWordsPerChapter,
      dialogueRatio,
      avgTension,
      tensionLevels
    };
  }, [bookContent, metadata]);

  const formatReadingTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 bg-zinc-900/40 border border-zinc-800 rounded text-xs text-zinc-400">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {/* Chapters */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Chapters</span>
          <span className="text-zinc-100 font-semibold tabular-nums">{stats.chapterCount}</span>
          {stats.avgWordsPerChapter > 0 && (
            <span className="text-zinc-500 text-[11px]">({stats.avgWordsPerChapter.toLocaleString()} w/ch)</span>
          )}
        </div>

        <span className="text-zinc-700 hidden sm:inline" aria-hidden="true">·</span>

        {/* Total Words */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Words</span>
          <span className="text-zinc-100 font-semibold tabular-nums">{stats.totalWords.toLocaleString()}</span>
          <span className="text-zinc-500 text-[11px]">({stats.characters.toLocaleString()} chars)</span>
        </div>

        <span className="text-zinc-700 hidden sm:inline" aria-hidden="true">·</span>

        {/* Reading Time */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Read Time</span>
          <span className="text-zinc-100 font-semibold tabular-nums">{formatReadingTime(stats.readingTimeMinutes)}</span>
        </div>

        <span className="text-zinc-700 hidden sm:inline" aria-hidden="true">·</span>

        {/* Dialogue Ratio */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Dialogue</span>
          <span className="text-zinc-100 font-semibold tabular-nums">{stats.dialogueRatio}%</span>
        </div>
      </div>

      {/* Tension / Secondary Info */}
      <div className="flex items-center gap-3 text-zinc-500 text-[11px]">
        {stats.avgTension && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Avg Tension</span>
            <span className="text-zinc-300 font-medium tabular-nums">{stats.avgTension} / 10</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookStatistics;
