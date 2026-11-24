// Scripted provider fixture. This verifies UI state transitions, not live model quality.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import EditorialChatStudio from '../../components/EditorialChatStudio';
const initial = '## Chapter 1\n\nNora locked the door with the key.\n\n## Chapter 2\n\nNora opened the locked door without a key.';
const metadata = { audit: { findings: [{ description: 'Key continuity contradicts Chapter 1 and Chapter 2.', severity: 'major', evidence_refs: ['chapter-1: Nora locked the door with the key.', 'chapter-2: Nora opened the locked door without a key.'] }], need_more_evidence: ['Reader assessment unavailable.'] } };
const callModel = async (prompt: string) => {
 if (prompt.includes('ORIGINAL OBSERVATION:')) {
   const resolved = prompt.split('CURRENT TEXT:')[1]?.includes('Nora used her key to open the door.');
   return JSON.stringify({status:resolved?'resolved':'open',explanation:resolved?'The key is explicitly used.':'The key contradiction remains.',evidence:[{chapter:2,quote:resolved?'Nora used her key to open the door.':'Nora opened the locked door without a key.'}]});
 }
 return '```tool:propose_diff\n{"chapter":2,"search":"Nora opened the locked door without a key.","replace":"Nora used her key to open the door.","rationale":"Use the established key."}\n```';
};
function Fixture() {
 const [text,setText] = useState(initial);
 const [previous,setPrevious] = useState<string[]>([]);
 return <><h1>Scripted editorial workflow</h1><label>Live manuscript<textarea aria-label="Live manuscript" value={text} onChange={e=>setText(e.target.value)}/></label><EditorialChatStudio bookContent={text} metadata={metadata} callModel={callModel} onApplyPatch={next=>{setPrevious(p=>[...p,text]);setText(next);return true;}} onUndoPatch={()=>{setText(previous.at(-1)!);setPrevious(p=>p.slice(0,-1));}} canUndo={previous.length>0}/></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
