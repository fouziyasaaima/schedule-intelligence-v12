"use client";
import { useMemo, useState } from "react";
import { ArrowRight, GitCompareArrows, RotateCcw, ShieldCheck, Sparkles, X, Zap } from "lucide-react";
import { api, type ApiConfig } from "@/lib/api-client";
import type { Task } from "@/types/gantt";

type Result = { beforeFinish:string; afterFinish:string; deltaDays:number; impactedTasks:Array<{taskId:string;startShiftDays:number;finishShiftDays:number}>; warning:string };

export function ImpactPanel({config, projectId, tasks, selectedId, onClose}:{config:ApiConfig;projectId:string;tasks:Task[];selectedId:string|null;onClose:()=>void}) {
  const [taskId,setTaskId]=useState(selectedId||tasks[0]?.id||"");
  const [delta,setDelta]=useState(3);
  const [running,setRunning]=useState(false);
  const [result,setResult]=useState<Result|null>(null);
  const [error,setError]=useState("");
  const selected=useMemo(()=>tasks.find(t=>t.id===taskId),[tasks,taskId]);
  async function simulate(){
    if(!selected)return;
    setRunning(true);setError("");
    try {
      const start=new Date(selected.expectedStart); start.setDate(start.getDate()+delta);
      const end=new Date(selected.expectedEnd); end.setDate(end.getDate()+delta);
      setResult(await api.scenarioImpact(config,projectId,{changes:[{taskId:selected.id,expectedStart:start.toISOString(),expectedEnd:end.toISOString()}]}));
    } catch(e){setError(e instanceof Error?e.message:"Impact simulation failed");}
    finally{setRunning(false)}
  }
  const date=(s:string)=>new Intl.DateTimeFormat(undefined,{day:"2-digit",month:"short",year:"numeric"}).format(new Date(s));
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}><section className="impact-panel">
    <header><div><span className="eyebrow">Schedule Intelligence IMPACT ENGINE</span><h2>Change the plan. See the consequences.</h2><p>Preview schedule, downstream and target impact without writing anything to the project.</p></div><button className="icon-button" onClick={onClose}><X/></button></header>
    <div className="impact-controls">
      <label>TASK<select value={taskId} onChange={e=>{setTaskId(e.target.value);setResult(null)}}>{tasks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>MOVE TASK <b>{delta > 0 ? "+" : ""}{delta} days</b><input type="range" min="-10" max="20" value={delta} onChange={e=>{setDelta(Number(e.target.value));setResult(null)}}/></label>
      <button className="primary-button" disabled={!selected||running} onClick={()=>void simulate()}>{running?<><span className="spinner"/>Simulating…</>:<><GitCompareArrows size={14}/>Preview impact</>}</button>
    </div>
    {error&&<div className="simulation-error">{error}</div>}
    {!result&&!running&&selected&&<div className="impact-empty"><div className="impact-orb"><Sparkles/></div><strong>Try moving “{selected.name}” by {delta} day{Math.abs(delta)===1?"":"s"}.</strong><span>Schedule Intelligence will calculate the downstream schedule ripple while keeping your saved plan untouched.</span><button className="ghost-button" onClick={()=>void simulate()}><Zap size={13}/> Run preview</button></div>}
    {running&&<div className="simulation-running"><div className="impact-wave"><i/><i/><i/><i/><i/></div><strong>Propagating the schedule ripple…</strong><span>Checking dependencies and recomputing downstream dates</span></div>}
    {result&&<div className="impact-result">
      <div className="impact-hero"><div><small>CURRENT FINISH</small><strong>{date(result.beforeFinish)}</strong></div><ArrowRight size={22}/><div className={result.deltaDays>0?"danger":"good"}><small>SCENARIO FINISH</small><strong>{date(result.afterFinish)}</strong></div><div className="impact-delta"><small>PROJECT DELTA</small><strong>{result.deltaDays>0?"+":""}{result.deltaDays}d</strong></div></div>
      <div className="impact-list"><div className="chart-title"><span><Zap size={13}/> DOWNSTREAM IMPACT</span><button onClick={()=>setResult(null)}><RotateCcw size={12}/> Try another</button></div>{result.impactedTasks.length===0?<div className="impact-noop"><ShieldCheck size={17}/> No downstream schedule movement detected.</div>:result.impactedTasks.slice(0,10).map(x=>{const t=tasks.find(t=>t.id===x.taskId);return <div className="impact-row" key={x.taskId}><span className="impact-task">{t?.name||x.taskId}</span><span>{x.startShiftDays>0?`Start +${x.startShiftDays}d`:x.startShiftDays<0?`Start ${x.startShiftDays}d`:"Start unchanged"}</span><span>{x.finishShiftDays>0?`Finish +${x.finishShiftDays}d`:x.finishShiftDays<0?`Finish ${x.finishShiftDays}d`:"Finish unchanged"}</span></div>})}</div>
      <div className="simulation-note"><strong>Schedule Intelligence says</strong><span>{result.warning}</span></div>
    </div>}
  </section></div>;
}
