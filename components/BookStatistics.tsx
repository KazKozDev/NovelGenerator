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
    
    // Get chapter count
    const chapterMatches = bookContent.match(/^##\s+Chapter\s+\d+/gm);
    const chapterCount = chapterMatches ? chapterMatches.length : 0;
    
    // Calculate average words per chapter
    const avgWordsPerChapter = chapterCount > 0 ? Math.round(totalWords / chapterCount) : 0;
    
    // Calculate dialogue ratio (approximate - count lines with quotes)
    const dialogueLines = bookContent.split('\n').filter(line => 
      line.includes('"') || line.includes('"') || line.includes('"')
    ).length;
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {/* Total Words */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-sm">
        <div className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-1">Total Words</div>
        <div className="text-zinc-100 text-2xl font-semibold font-mono">{stats.totalWords.toLocaleString()}</div>
        <div className="text-zinc-500 text-xs mt-1 font-mono">{stats.characters.toLocaleString()} characters</div>
      </div>

      {/* Reading Time */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-sm">
        <div className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-1">Reading Time</div>
        <div className="text-zinc-100 text-2xl font-semibold font-mono">{formatReadingTime(stats.readingTimeMinutes)}</div>
        <div className="text-zinc-500 text-xs mt-1 font-mono">~200 words/min</div>
      </div>

      {/* Chapters */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-sm">
        <div className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-1">Chapters</div>
        <div className="text-zinc-100 text-2xl font-semibold font-mono">{stats.chapterCount}</div>
        <div className="text-zinc-500 text-xs mt-1 font-mono">{stats.avgWordsPerChapter.toLocaleString()} words avg</div>
      </div>

      {/* Dialogue Ratio */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-sm">
        <div className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-1">Dialogue</div>
        <div className="text-zinc-100 text-2xl font-semibold font-mono">{stats.dialogueRatio}%</div>
        <div className="text-zinc-500 text-xs mt-1 font-mono">of content</div>
      </div>
    </div>
  );
};

export default BookStatistics;
