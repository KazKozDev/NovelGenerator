import type {AgentLogEntry} from '../../../types';
import type {RunLogEntry} from '../v2/store';
/** Restore actual model events, never infer calls from prose or checkpoint messages. */
export function restoreModelEvents(logs:RunLogEntry[]):AgentLogEntry[] {
 const entries=new Map<string,AgentLogEntry>();
 for(const log of logs){try{const data=JSON.parse(log.detail);if(log.stage==='model_call'&&typeof data.id==='string'&&Number.isFinite(data.entry?.timestamp)&&typeof data.entry?.message==='string')entries.set(data.id,data.entry);else if(log.stage==='model_result'&&entries.has(data.id))entries.set(data.id,{...entries.get(data.id)!,...data.result});}catch{/* Other project log records are plain text. */}}
 return [...entries.values()].map(entry=>entry.finished?entry:{...entry,type:'warning',finished:true,outcome:'Interrupted — no completed response was recorded.'});
}
export function modelTimeMs(logs:AgentLogEntry[],running:boolean,now:number):number|null {
 const measured=logs.filter(log=>Number.isFinite(log.finishedAt)||running&&log.type==='execution'&&!log.finished);
 if(!measured.length)return null;
 return measured.reduce((sum,log)=>sum+Math.max(0,(log.finishedAt||now)-log.timestamp),0);
}
export function durationLabel(ms:number|null):string {
 if(ms===null)return '—';const seconds=Math.floor(ms/1000);if(seconds<1)return '<1 s';if(seconds<60)return `${seconds} s`;const minutes=Math.floor(seconds/60);return minutes<60?`${minutes}m ${seconds%60}s`:`${Math.floor(minutes/60)}h ${minutes%60}m`;
}
