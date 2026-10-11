import { it, expect } from 'vitest';
import { affectedByEdits } from '../utils/novel/v2/editImpact';
import type { ThesisPlan, ThesisDraft } from '../utils/novel/v2/theses';
it('invalidates the edited scene, the scene after it and a scene carrying the replaced words, and nothing else', () => {
  const plan = { theses: [
    { id: 'A', requires: [] }, { id: 'B', requires: [] },
    { id: 'C', requires: [] }, { id: 'D', requires: ['B'] },
    { id: 'E', requires: ['D'] }, { id: 'F', requires: [] },
  ] } as unknown as ThesisPlan;
  const blocks = ['A','B','C','D','E','F'].map(id => ({ thesis_id: id, text: id === 'E' ? 'The silver key opens the door.' : 'Unrelated sentence.', review: { ready: true, issues: [] } })) as ThesisDraft['blocks'];
  const impacted = affectedByEdits(plan, blocks, [{ block_id: 'A', before: 'silver key', after: 'bronze key' }]);
  expect(impacted).toEqual(['A','B','E']);
});

it('does not search with a zero limit when repairing the first pending block',()=>{
  const plan={theses:[{id:'A',requires:[]}]} as unknown as ThesisPlan;
  expect(affectedByEdits(plan,[],[{block_id:'A',before:'old',after:'new'}])).toEqual([]);
});
