// Isolated UI fixture: no project store, autosave API, provider credentials or model calls.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BookDisplay from '../../components/BookDisplay';

function Workshop() {
  const [edited, setEdited] = useState(false);
  return <><p role="status">{edited ? 'Edit callback received' : 'Isolated reader workshop fixture'}</p><BookDisplay
    bookContent={'# The Key\n\n## Chapter 1\n\nNora opened the locked door.\n\n## Chapter 2\n\nThe key was still inside the sealed box.'}
    metadataJson={JSON.stringify({ title: 'The Key', audit: { status: 'COMPLETE_WITH_WARNINGS', summary: '2 chapters. 1 unresolved finding.', findings: [{ severity: 'major', description: 'The door opens without the key.', evidence_refs: ['Chapter 1: Nora opened the locked door.'] }], need_more_evidence: [] } })}
    onEdit={() => setEdited(true)} onReset={() => {}} /></>;
}
createRoot(document.getElementById('root')!).render(<Workshop />);
