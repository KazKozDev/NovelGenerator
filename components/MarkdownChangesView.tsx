import React from 'react';
import {MarkdownView} from './common/MarkdownView';
import {markdownRevision} from '../utils/markdownRevision';
import {textRevision} from '../utils/textRevision';

export default function MarkdownChangesView({before,after}: {before:string;after:string}) {
  return <div className="manuscript-changes font-serif text-prose max-w-[62ch] mx-auto">{markdownRevision(before,after).map((block,index) => {
    if (!block.changed) return <MarkdownView key={index} content={block.after} />;
    // A simple prose paragraph can retain word-level edits; Markdown syntax is
    // rendered as whole blocks rather than broken across replacement boundaries.
    if (block.before.trim() && block.after.trim() && !/[\n#*_`|<>\[\]~]/.test(block.before.trim()+block.after.trim())) {
      const revision = textRevision(block.before.trim(),block.after.trim());
      return <div key={index} className="markdown-content"><p>{revision.prefix}{revision.removed && <del className="revision-removed">{revision.removed}</del>}{revision.added && <ins className="revision-added">{revision.added}</ins>}{revision.suffix}</p></div>;
    }
    return <div key={index} className="revision-block">{block.before && <del className="revision-removed revision-markdown"><MarkdownView content={block.before} /></del>}{block.after && <ins className="revision-added revision-markdown"><MarkdownView content={block.after} /></ins>}</div>;
  })}</div>;
}
