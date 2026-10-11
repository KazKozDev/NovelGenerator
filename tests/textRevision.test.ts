import { expect,it } from 'vitest';
import { textRevision } from '../utils/textRevision';
it('highlights only changed words while retaining surrounding prose',()=>{
 expect(textRevision('He closed the door.','He opened the door.')).toEqual({prefix:'He ',removed:'closed',added:'opened',suffix:' the door.'});
});
it('represents insertions and deletions without losing unchanged text',()=>{
 for(const [before,after] of [['First.','First. Next.'],['First. Again.','First.']]){
  const d=textRevision(before,after);expect(d.prefix+d.removed+d.suffix).toBe(before);expect(d.prefix+d.added+d.suffix).toBe(after);
 }
});
