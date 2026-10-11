import type { ThesisPlan, ThesisDraft } from './theses';
import type { TextEdit } from './manuscriptTools';

/** Which accepted reviews an edit makes stale. */
export function affectedByEdits(plan: ThesisPlan, blocks: ThesisDraft['blocks'], edits: TextEdit[]): string[] {
  // A repair of the first pending block has no accepted prose to search yet.
  if(!blocks.length || !edits.length)return [];
  // A re-review is a model call the size of a scene. An edit invalidates the review of the
  // scene it changed, of the scene that opens on its ending, and of any scene that carries
  // the replaced words themselves. It used to invalidate every scene sharing a word with the
  // edit and everything downstream of those: after one expanded scene, nine of twelve.
  const affected = new Set(edits.map(e => e.block_id));
  for (const edit of edits) {
    const index = plan.theses.findIndex(t => t.id === edit.block_id);
    if (plan.theses[index + 1]) affected.add(plan.theses[index + 1].id);
    const phrase = edit.before.trim();
    if (phrase.length >= 8 && phrase.length <= 200) for (const block of blocks) if (block.text.includes(phrase)) affected.add(block.thesis_id);
  }
  return plan.theses.filter(t => affected.has(t.id) && blocks.some(b => b.thesis_id === t.id)).map(t => t.id);
}
