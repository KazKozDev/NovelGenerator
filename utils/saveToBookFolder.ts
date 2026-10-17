/**
 * What a Save button does: the file goes to its book's folder in Documents/NovelGenerator through the dev server.
 * Only when the server cannot save it (the app opened without it) does the browser download it instead.
 */
export type BookFileKind = 'manuscripts' | 'covers' | 'reports' | 'blueprints' | 'backups';

export interface BookFile {
  title: string;
  kind: BookFileKind;
  /** What the file is, in words: "книга", "черновик", "обложка eBook 1600x2560". */
  label: string;
  ext: string;
  content: string | Blob;
  /** Add the date and time to the name (default), or replace the file of that name. */
  stamp?: boolean;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The saved file's path from Documents ("NovelGenerator/<Book>/текст/книга 2026-10-17 15.02.epub"), or null. */
export async function saveToBookFolder(file: BookFile): Promise<string | null> {
  try {
    const binary = typeof file.content !== 'string';
    const res = await fetch('/api/save-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: file.title,
        category: file.kind,
        label: file.label,
        ext: file.ext,
        stamp: file.stamp ?? true,
        content: binary ? await blobToBase64(file.content as Blob) : file.content,
        base64: binary,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.relativePath || data.fileName || null;
  } catch {
    return null;
  }
}

export function downloadInBrowser(content: string | Blob, name: string, type = 'application/octet-stream'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Saves into the book folder; downloads under `downloadName` only if that fails. Returns where it was saved, or null. */
export async function saveOrDownload(file: BookFile, downloadName: string, type?: string): Promise<string | null> {
  const saved = await saveToBookFolder(file);
  if (!saved) downloadInBrowser(file.content, downloadName, type);
  return saved;
}
