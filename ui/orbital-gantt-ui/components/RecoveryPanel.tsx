"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, Sparkles, Target, X, Zap } from "lucide-react";
import { api, type ApiConfig } from "@/lib/api-client";
import type { Task } from "@/types/gantt";

type Recommendation={id:string;title:string;action:string;expectedRecoveryDays:number;risk:string;reason:string};
type Result={currentFinish:string;targetDate:string|null;delayDays:number;recommendations:Recommendation[]};
export function RecoveryPanel({config,projectId,tasks,onClose}:{config:ApiConfig;projectId:string;tasks:Task[];onClose:()=>void}){
 const [result,setResult]=useState<Result|null>(null); const [running,setRunning]=useState(false); const [error,setError]=useState("");
 useEffect(()=>{let live=true;(async()=>{setRunning(true);try{const r=await api.recoveryRecommendations(config,projectId,{});if(live)setResult(r)}catch(e){if(live)setError(e instanceof Error?e.message:"Recovery analysis failed")}finally{if(live)setRunning(false)}})();return()=>{live=false}},[config,projectId]);
 const date=(s:string)=>new Intl.DateTimeFormat(undefined,{day:"2-digit",month:"short",year:"numeric"}).format(new Date(s));
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}><section className="recovery-panel"><header><div><span className="eyebrow">Schedule Intelligence RECOVERY ENGINE</span><h2>Protect the outcome, not just the date.</h2><p>Auditable recovery options are calculated from the live schedule. Nothing is changed until you choose it.</p></div><button className="icon-button" onClick={onClose}><X/></button></header>
 {running&&<div className="simulation-running"><div className="impact-wave"><i/><i/><i/><i/><i/></div><strong>Searching the schedule for recovery paths…</strong><span>Evaluating critical work, target pressure and resource signals</span></div>}
 {error&&<div className="simulation-error">{error}</div>}
 {result&&!running&&<><div className="recovery-hero"><div><small>CURRENT FINISH</small><strong>{date(result.currentFinish)}</strong></div><div className={result.delayDays>0?"danger":"good"}><small>TARGET PRESSURE</small><strong>{result.delayDays>0?`${result.delayDays}d late`:"Protected"}</strong></div><div><small>OPTIONS</small><strong>{result.recommendations.length}</strong></div></div><div className="recovery-list">{result.recommendations.map((r,i)=><article key={r.id} className="recovery-card"><div className="recovery-rank">0{i+1}</div><div className="recovery-copy"><div className="recovery-title"><strong>{r.title}</strong><span className={`risk-${r.risk.toLowerCase()}`}>{r.risk}</span></div><p>{r.reason}</p><small>{r.action}</small></div><div className="recovery-gain"><b>{r.expectedRecoveryDays?`−${r.expectedRecoveryDays}d`:`—`}</b><span>recovery</span></div><button className="ghost-button" onClick={()=>alert("Preview this strategy from Impact before applying it.")}><Sparkles size={13}/> Preview</button></article>)}</div><div className="simulation-note"><ShieldCheck size={14}/><span>Recovery recommendations are previews. Use Impact to validate a specific change, then apply the approved change through the normal task mutation.</span></div></>}
 </section></div>
}
