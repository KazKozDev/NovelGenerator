import { useWorkspaceEntry } from '../../utils/workspaceState';
import type { BuildRecord } from '../../utils/publish/publishStatus';

/** An edition's last build and the day it went live, kept with the book so a reload knows where it stands. */
export function usePlatformMemory(title: string, key: string) {
  const [record, setRecord] = useWorkspaceEntry<BuildRecord>(title, `publish.build:${key}`);
  const [liveAt, setLive] = useWorkspaceEntry<number>(title, `publish.live:${key}`);
  return { record, setRecord, liveAt, setLive };
}
