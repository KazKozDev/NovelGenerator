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
      // Generated exact edits sometimes omit the separator after closing
      // emphasis: *sentence.*Next. Repair only this unambiguous prose boundary
      // for display; never alter the saved manuscript or fenced/inline code.
      const displayContent = marked.lexer(content).map(token => token.type === 'paragraph'
        ? token.raw.split(/(`+[^`]*`+)/g).map((part, index) => index % 2 ? part : part.replace(
          /(^|[\s(])(\*{1,2})(?=\S)([^*\n]+?[.!?,;:'"’”])\2(?=[\p{L}\p{N}])/gu,
          '$1$2$3$2 ',
        )).join('')
        : token.raw).join('');
      const rawHtml = marked.parse(displayContent, {
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
      />
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse ml-1 align-middle" />
      )}
    </div>
  );
};

export default MarkdownView;
