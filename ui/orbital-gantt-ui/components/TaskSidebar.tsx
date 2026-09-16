"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronRight, Link2, Milestone, Pin, Target } from "lucide-react";
import type { Task, Dependency, DependencyType } from "@/types/gantt";
import { ROW_HEIGHT } from "@/lib/timeline";

const typeLabel=(type:DependencyType)=>({FINISH_TO_START:"FS",START_TO_START:"SS",FINISH_TO_FINISH:"FF",START_TO_FINISH:"SF"}[type]);
const typeLong=(type:DependencyType)=>({FINISH_TO_START:"Finish → Start",START_TO_START:"Start → Start",FINISH_TO_FINISH:"Finish → Finish",START_TO_FINISH:"Start → Finish"}[type]);

export function TaskSidebar({tasks,dependencies,onUpdateDates,onUpdateDependency,onSelect,selectedId,overloadedTaskIds=[],scrollTop=0,onVerticalScroll}:{tasks:Task[];dependencies:Dependency[];onUpdateDates:(taskId:string,start:string,end:string)=>void;onUpdateDependency:(id:string,patch:{dependencyType?:string;lagDays?:number})=>Promise<void>;overloadedTaskIds?:string[];onSelect:(taskId:string)=>void;selectedId:string|null;scrollTop?:number;onVerticalScroll?:(scrollTop:number)=>void}){
 const [tab,setTab]=useState<"grid"|"links"|"details">("grid");
 const bodyRef=useRef<HTMLDivElement>(null);
 const applyingScrollRef=useRef(false);
 const lastScrollTopRef=useRef(0);
 useEffect(()=>{
   const el=bodyRef.current;
   if(!el)return;
   if(Math.abs(el.scrollTop-scrollTop)<=1)return;
   applyingScrollRef.current=true;
   el.scrollTop=scrollTop;
   requestAnimationFrame(()=>{applyingScrollRef.current=false;lastScrollTopRef.current=el.scrollTop;});
 },[scrollTop]);
 const handleVerticalScroll=(top:number)=>{
   if(applyingScrollRef.current || Math.abs(lastScrollTopRef.current-top)<=0.5)return;
   lastScrollTopRef.current=top;
   onVerticalScroll?.(top);
 };
 const handleKeyDown=(e:React.KeyboardEvent<HTMLDivElement>)=>{
   if(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)return;
   if(!bodyRef.current)return;
   const step=e.shiftKey?ROW_HEIGHT*5:ROW_HEIGHT;
   let delta=0;
   if(e.key==='ArrowDown')delta=step;
   else if(e.key==='ArrowUp')delta=-step;
   else if(e.key==='PageDown')delta=bodyRef.current.clientHeight*.85;
   else if(e.key==='PageUp')delta=-bodyRef.current.clientHeight*.85;
   else if(e.key==='Home'){e.preventDefault();handleVerticalScroll(0);bodyRef.current.scrollTop=0;return;}
   else if(e.key==='End'){e.preventDefault();const top=bodyRef.current.scrollHeight-bodyRef.current.clientHeight;handleVerticalScroll(top);bodyRef.current.scrollTop=top;return;}
   else return;
   e.preventDefault();
   const max=Math.max(0,bodyRef.current.scrollHeight-bodyRef.current.clientHeight);
   handleVerticalScroll(Math.max(0,Math.min(max,bodyRef.current.scrollTop+delta)));
 };
 const selected=tasks.find(t=>t.id===selectedId)||null;
 const active=dependencies.filter(d=>d.isActive);
 const predecessorLinks=selected?active.filter(d=>d.successorId===selected.id):[];
 const successorLinks=selected?active.filter(d=>d.predecessorId===selected.id):[];
 const nameById=useMemo(()=>new Map(tasks.map(t=>[t.id,t.name])),[tasks]);
 const counts=new Map<string,number>();active.forEach(d=>{counts.set(d.predecessorId,(counts.get(d.predecessorId)||0)+1);counts.set(d.successorId,(counts.get(d.successorId)||0)+1)});
 const signal=(t:Task)=>t.actualEnd==null&&new Date(t.expectedEnd).getTime()<Date.now()&&t.progressPct<100?"overdue":t.targetFeasible===false?"target-risk":t.isCritical?"critical":overloadedTaskIds.includes(t.id)?"resource-pressure":t.progressPct>=100?"complete":"on-track";
 return <aside className="task-sidebar">
   <div className="task-sidebar-tabs"><button className={tab==="grid"?"active":""} onClick={()=>setTab("grid")}>Task grid</button><button className={tab==="links"?"active":""} onClick={()=>setTab("links")}>Dependencies <em>{selected?predecessorLinks.length+successorLinks.length:active.length}</em></button><button className={tab==="details"?"active":""} onClick={()=>setTab("details")}>Details</button></div>
   {tab==="grid"&&<><div className="task-sidebar-head"><span>Task</span><span>Start</span><span>End</span></div><div className="task-sidebar-body" ref={bodyRef} tabIndex={0} aria-label="Task list" onScroll={e=>handleVerticalScroll(e.currentTarget.scrollTop)} onKeyDown={handleKeyDown}>{tasks.map(t=><div className={`task-sidebar-row ${selectedId===t.id?"selected":""} signal-${signal(t)}`} style={{height:ROW_HEIGHT}} key={t.id} onClick={()=>onSelect(t.id)}><div className="task-name-cell"><i className={`task-signal-dot ${signal(t)}`} title={signal(t).replace("-"," ")}/>{t.isManualSchedule&&<Pin size={11}/>} {t.taskType==="MILESTONE"&&<Milestone size={12}/>} {t.targetDate&&<Target size={11} className={t.targetFeasible===false?"target-risk":"target-ok"}/>}<span title={t.name}>{t.name}</span>{counts.get(t.id)?<em className="dependency-count" title={`${counts.get(t.id)} dependencies`}><Link2 size={9}/>{counts.get(t.id)}</em>:null}</div><label className="date-cell"><input aria-label={`${t.name} start`} type="date" value={t.expectedStart.slice(0,10)} onClick={e=>e.stopPropagation()} onChange={e=>onUpdateDates(t.id,e.target.value,t.expectedEnd.slice(0,10))}/><CalendarDays size={11}/></label><label className="date-cell"><input aria-label={`${t.name} end`} type="date" value={t.expectedEnd.slice(0,10)} onClick={e=>e.stopPropagation()} onChange={e=>onUpdateDates(t.id,t.expectedStart.slice(0,10),e.target.value)}/><CalendarDays size={11}/></label></div>)}</div></>}
   {tab==="links"&&<div className="task-links-panel">{!selected?<div className="sidebar-empty"><Link2 size={18}/><strong>Select a task</strong><span>Choose a task to inspect its predecessor and successor logic.</span></div>:<><div className="sidebar-selected-task"><span className="eyebrow">SELECTED TASK</span><strong>{selected.name}</strong><span>{selected.isCritical?"Critical path":"Schedule slack"} · {selected.slackDays??0}d</span></div><LinkGroup title="Predecessors" empty="No predecessor constraints." links={predecessorLinks} nameById={nameById} onUpdateDependency={onUpdateDependency}/><LinkGroup title="Successors" empty="No successor constraints." links={successorLinks} nameById={nameById} onUpdateDependency={onUpdateDependency} reverse/></>}</div>}
   {tab==="details"&&<div className="task-details-panel">{!selected?<div className="sidebar-empty"><ChevronRight size={18}/><strong>Select a task</strong><span>Details, scheduling mode, dates, progress and dependency pressure appear here.</span></div>:<><div className="sidebar-selected-task"><span className="eyebrow">TASK DETAILS</span><strong>{selected.name}</strong></div><div className="detail-grid"><div><small>START</small><b>{new Date(selected.expectedStart).toLocaleDateString()}</b></div><div><small>FINISH</small><b>{new Date(selected.expectedEnd).toLocaleDateString()}</b></div><div><small>DURATION</small><b>{selected.durationDays}d</b></div><div><small>PROGRESS</small><b>{selected.progressPct||0}%</b></div><div><small>SLACK</small><b>{selected.slackDays??0}d</b></div><div><small>MODE</small><b>{selected.isManualSchedule?"Manual anchor":"Auto schedule"}</b></div></div><div className="detail-status"><span className={selected.isCritical?"status-critical":"status-ok"}>{selected.isCritical?"CRITICAL PATH":"SCHEDULED"}</span>{selected.targetDate&&<span className={selected.targetFeasible===false?"status-critical":"status-ok"}>Target {selected.targetFeasible===false?"at risk":"protected"}</span>}</div></>}</div>}
 </aside>
}

function LinkGroup({title,empty,links,nameById,onUpdateDependency,reverse=false}:{title:string;empty:string;links:Dependency[];nameById:Map<string,string>;onUpdateDependency:(id:string,patch:{dependencyType?:string;lagDays?:number})=>Promise<void>;reverse?:boolean}){
 return <section className="link-group"><div className="link-group-head"><span>{title}</span><em>{links.length}</em></div>{links.length===0?<div className="link-empty">{empty}</div>:links.map(d=>{const other=reverse?d.successorId:d.predecessorId;return <div className="link-row" key={d.id}><div className="link-other"><Link2 size={12}/><strong>{nameById.get(other)||other}</strong></div><div className="link-controls"><select aria-label="Dependency relationship" value={d.dependencyType} onChange={e=>void onUpdateDependency(d.id,{dependencyType:e.target.value})}><option value="FINISH_TO_START">FS · Finish → Start</option><option value="START_TO_START">SS · Start → Start</option><option value="FINISH_TO_FINISH">FF · Finish → Finish</option><option value="START_TO_FINISH">SF · Start → Finish</option></select><input aria-label="Lag or lead days" type="number" value={d.lagDays} onChange={e=>void onUpdateDependency(d.id,{lagDays:Number(e.target.value)||0})}/><span className="link-type-chip" title={typeLong(d.dependencyType)}>{typeLabel(d.dependencyType)}</span></div></div>})}</section>
}
