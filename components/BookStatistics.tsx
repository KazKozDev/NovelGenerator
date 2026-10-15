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
    <div className="font-mono text-xs text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{stats.chapterCount} Chapters ({stats.avgWordsPerChapter.toLocaleString()} avg)</span>
      <span className="text-zinc-600">•</span>
      <span>{stats.totalWords.toLocaleString()} Words ({(stats.characters / 1000).toFixed(1)}k chars)</span>
      <span className="text-zinc-600">•</span>
      <span>~{formatReadingTime(stats.readingTimeMinutes)} read</span>
      <span className="text-zinc-600">•</span>
      <span>{stats.dialogueRatio}% Dialogue</span>
    </div>
  );
};

export default BookStatistics;
