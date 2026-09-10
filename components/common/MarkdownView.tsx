import React, { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownViewProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

// Basic security sanitizer to strip script tags, iframe, and dangerous event handlers
const sanitizeHtml = (html: string): string => {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
};

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  className = '',
  isStreaming = false,
}) => {
  const renderedHtml = useMemo(() => {
    if (!content) return '';
    try {
      const rawHtml = marked.parse(content, {
        gfm: true,
        breaks: true,
        async: false,
      }) as string;
      return sanitizeHtml(rawHtml);
    } catch {
      return sanitizeHtml(content);
    }
  }, [content]);

  return (
    <div className={`markdown-content ${className}`}>
      <div 
        dangerouslySetInnerHTML={{ __html: renderedHtml }} 
        className="inline"
      />
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse ml-1 align-middle" />
      )}
    </div>
  );
};

export default MarkdownView;
