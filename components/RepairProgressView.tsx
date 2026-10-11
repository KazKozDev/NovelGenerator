import React from 'react';
import type {RepairReport} from '../utils/novel/v2/repairPackage';
export default function RepairProgressView({report}:{report:RepairReport}) {
  return <div className="shrink-0 mt-3 pb-3 border-b border-zinc-800 text-xs" aria-label="Repair package progress">
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <span className="uppercase font-semibold text-zinc-500">Last repair package</span>
      <span className="text-zinc-300 text-right">{report.status==='committed'?'Applied':report.status==='verified'?'Verified':'Returned for repair'}</span>
    </div>
    {([['Resolved',report.resolved.length],['Remaining',report.remaining.length],['New defects',report.introduced.length]] as const).map(([label,count])=><div key={label} className="flex items-baseline justify-between gap-2 mt-1.5"><span className="uppercase text-zinc-500">{label}</span><span className="text-zinc-300 tabular-nums text-right">{count}</span></div>)}
    <details className="mt-2 text-zinc-400"><summary className="cursor-pointer">Verified findings</summary>
      <div className="max-h-48 overflow-y-auto mt-2 space-y-2 break-words">
        {report.resolved.map(item=><p key={`resolved-${item.issue}`}><span className="text-zinc-300">Resolved: </span>{item.problem}<br/>{item.explanation}</p>)}
        {report.remaining.map((item,index)=><p key={`remaining-${index}`}><span className="text-zinc-300">Remaining: </span>{item.problem}<br/>{item.explanation}</p>)}
        {report.introduced.map((item,index)=><p key={`new-${index}`}><span className="text-zinc-300">New defect: </span>{item.problem}<br/>{item.required_change}</p>)}
      </div>
    </details>
  </div>;
}
