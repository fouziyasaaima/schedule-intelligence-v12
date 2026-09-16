"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, RefreshCw, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { api, ApiConfig } from "@/lib/api-client";
import type { Task } from "@/types/gantt";
import { notify } from "@/lib/notifications";
import { MacStudio } from "./MacStudio";

type Props={config:ApiConfig;projectId:string;projectName:string;selectedTask:Task|null;onSelectTask:(id:string)=>void;onClose:()=>void};

export function MacPanel({config,projectId,projectName,selectedTask,onSelectTask,onClose}:Props){
 const [data,setData]=useState<any>(null); const [status,setStatus]=useState<any>(null); const [alerts,setAlerts]=useState<any[]>([]); const [question,setQuestion]=useState(""); const [loading,setLoading]=useState(true); const [asking,setAsking]=useState(false); const [error,setError]=useState(""); const [studioOpen,setStudioOpen]=useState(false);
 const load=async()=>{setLoading(true);setError("");try{const [s,a]=await Promise.all([api.aiStatus(config,projectId),api.aiAlerts(config,projectId)]);setStatus(s);setAlerts(a)}catch(e){setError(e instanceof Error?e.message:"MAC could not read its configuration.")}finally{setLoading(false)}};
 useEffect(()=>{setData(null);void load()},[projectId]);
 async function ask(e?:React.FormEvent){e?.preventDefault();if(!question.trim())return;setAsking(true);setError("");try{const r=await api.aiBrief(config,projectId,question.trim());setData(r);setQuestion("")}catch(e){setError(e instanceof Error?e.message:"MAC request failed")}finally{setAsking(false)}}
 const icon=(s:string)=>s==="CRITICAL"||s==="HIGH"?<AlertTriangle size={15}/>:s==="MEDIUM"?<Sparkles size={15}/>:<CheckCircle2 size={15}/>;
 return <div className="mac-overlay"><section className="mac-panel" aria-label="MAC — Schedule Intelligence's reasoning engine">
   <header className="mac-head"><div><span className="eyebrow">SCHEDULE INTELLIGENCE · MAC</span><h1><BrainCircuit size={20}/> {projectName}</h1><p>Evidence-first reasoning over the live schedule. MAC reasons over minimized evidence; deterministic engines remain the source of schedule truth.</p></div><div className="ai-head-actions"><span className={`ai-provider-pill ${status?.configured?"ready":"missing"}`}>{status?.configured?`${status.provider} · ${status.model}`:"MAC not configured"}</span><button className="ghost-button" onClick={()=>setStudioOpen(true)}>MAC Studio</button><button className="icon-button" onClick={onClose}><X/></button></div></header>
   {error&&<div className="ai-error"><AlertTriangle size={15}/><span>{error}</span><button className="ghost-button" onClick={()=>void load()}>Retry</button></div>}
   {!status?.configured&&!loading&&<div className="ai-setup-card"><ShieldCheck size={20}/><div><strong>Configure MAC on the API server</strong><p>Set GEMINI_API_KEY or OPENAI_API_KEY on the API container, then rebuild/restart. Keys never go to the browser.</p></div></div>}
   {loading?<div className="ai-loading"><BrainCircuit className="spin"/><strong>Loading MAC policy…</strong><span>No model call is made until you explicitly ask MAC for reasoning.</span></div>:data&&<>
    <div className="ai-hero"><div className="ai-hero-orb"><BrainCircuit size={25}/></div><div><span className="eyebrow">EXECUTIVE READ</span><h2>{data.executiveSummary}</h2><p>{data.outlook}</p></div><button className="ghost-button" onClick={()=>void load()}><RefreshCw size={13}/> Refresh</button></div>
    <div className="ai-priority-strip">{data.priorities?.map((p:string,i:number)=><span key={i}><b>{i+1}</b>{p}</span>)}</div>
    {selectedTask&&<div className="ai-selected"><div><span className="eyebrow">SELECTED TASK</span><strong>{selectedTask.name}</strong><span>{selectedTask.isCritical?"Critical path · ":""}{selectedTask.slackDays??0}d slack · {selectedTask.progressPct||0}% progress</span></div><button className="ghost-button" onClick={()=>setQuestion(`Explain ${selectedTask.name} and the most important dependency, target, resource, progress and recovery signals around it.`)}>Explain this task <ArrowRight size={13}/></button></div>}
    <div className="ai-insights-grid">{data.insights?.map((item:any,i:number)=><article key={`${item.title}-${i}`} className={`ai-insight-card ${String(item.severity).toLowerCase()}`}><div className="ai-insight-icon">{icon(item.severity)}</div><div className="ai-insight-body"><div className="ai-insight-meta"><span>{item.severity}</span>{item.evidenceTaskIds?.length>0&&<small>{item.evidenceTaskIds.length} evidence tasks</small>}</div><h3>{item.title}</h3><p>{item.summary}</p><small className="ai-why">{item.why}</small>{item.actions?.length>0&&<div className="ai-actions"><b>Suggested next moves</b>{item.actions.map((a:string,j:number)=><div key={j}>→ {a}</div>)}</div>}{item.evidenceTaskIds?.length>0&&<button className="ai-evidence" onClick={()=>onSelectTask(item.evidenceTaskIds[0])}>Open evidence <ArrowRight size={12}/></button>}</div></article>)}</div>
    {alerts.length>0&&<div className="ai-alerts"><div><span className="eyebrow">AUTONOMOUS WATCH</span><strong>Recent AI alerts</strong></div>{alerts.slice(0,5).map((a:any)=><div className="ai-alert-row" key={a.id}><AlertTriangle size={13}/><span>{a.payload?.title||"Schedule signal"}</span><small>{new Date(a.createdAt).toLocaleString()}</small></div>)}</div>}
   </>}
   {!loading&&!data&&status?.configured&&<div className="ai-ready-card"><BrainCircuit size={18}/><div><strong>MAC is ready.</strong><span>Ask a question when you want model reasoning. Opening this panel does not spend AI tokens.</span></div></div>}
   <form className="ai-ask" onSubmit={ask}><BrainCircuit size={16}/><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask MAC about this schedule… e.g. What is most likely to delay the target?" disabled={asking||!status?.configured}/><button className="primary-button" disabled={asking||!question.trim()||!status?.configured}>{asking?<RefreshCw className="spin" size={14}/>:<Send size={14}/>} {asking?"Reasoning…":"Ask MAC"}</button></form>
 </section>{studioOpen&&<MacStudio config={config} onClose={()=>setStudioOpen(false)}/>}</div>;
}
