"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, Layers3, Milestone, X, Zap } from "lucide-react";
import type { Task, TaskType } from "@/types/gantt";

export function TaskComposer({ open, tasks, initialParentId = "", onClose, onCreate }: { open: boolean; tasks: Task[]; initialParentId?: string; onClose:()=>void; onCreate:(v:{name:string;taskType:TaskType;expectedStart:string;expectedEnd:string;parentId?:string})=>Promise<void> }) {
  const today = new Date(); today.setHours(0,0,0,0); const end = new Date(today); end.setDate(end.getDate()+5);
  const [name,setName]=useState(""); const [type,setType]=useState<TaskType>("TASK"); const [start,setStart]=useState(today.toISOString().slice(0,10)); const [finish,setFinish]=useState(end.toISOString().slice(0,10)); const [parentId,setParentId]=useState(initialParentId); const [saving,setSaving]=useState(false); const [formError,setFormError]=useState<string|null>(null);
  const startRef=useRef<HTMLInputElement>(null), finishRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{ if(open){setName("");setType("TASK");setSaving(false);setFormError(null);setParentId(initialParentId);setStart(today.toISOString().slice(0,10));setFinish(end.toISOString().slice(0,10))} },[open,initialParentId]);
  if(!open) return null;
  const openPicker=(ref:React.RefObject<HTMLInputElement|null>)=>{const input=ref.current; if(!input)return; try{(input as HTMLInputElement & {showPicker?:()=>void}).showPicker?.()}catch{input.focus()}};
  async function submit(e:React.FormEvent){e.preventDefault();setFormError(null);if(!name.trim()){setFormError("Give this work item a name.");return}if(!start){setFormError("Choose a start date.");return}if(type!=="MILESTONE"&&finish<start){setFormError("Finish date cannot be before the start date.");return}setSaving(true);try{await onCreate({name:name.trim(),taskType:type,expectedStart:start,expectedEnd:type==="MILESTONE"?start:finish,parentId:parentId||undefined});onClose()}catch(e){setFormError(e instanceof Error?e.message:"Could not create the work item.")}finally{setSaving(false)}}
  const selectable=tasks.filter(t=>t.taskType!=="MILESTONE");
  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}><form className="composer" onSubmit={submit} onMouseDown={e=>e.stopPropagation()}>
    <div className="composer-glow"/><header><div><span className="eyebrow">NEW WORK ITEM</span><h2>Put work into orbit.</h2><p>Create a task without leaving the schedule.</p></div><button type="button" className="icon-button composer-close" aria-label="Close create work item" onClick={e=>{e.preventDefault();e.stopPropagation();onClose()}}><X size={18}/></button></header>
    <div className="type-picker">{([['TASK',Zap,'Task'],['SUMMARY',Layers3,'Summary'],['MILESTONE',Milestone,'Milestone']] as const).map(([v,I,l])=><button type="button" key={v} className={type===v?'selected':''} onClick={()=>setType(v)}><I size={16}/><span>{l}</span>{type===v&&<Check size={14}/>}</button>)}</div>
    <label className="hero-field"><span>Task name</span><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Launch customer onboarding"/></label>
    <div className="field-grid">
      <label><span><CalendarDays size={13}/> Start</span><div className="date-control"><input ref={startRef} type="date" value={start} onChange={e=>setStart(e.target.value)}/><button type="button" aria-label="Open start calendar" onClick={()=>openPicker(startRef)}><CalendarDays size={15}/></button></div></label>
      <label><span><CalendarDays size={13}/> Finish</span><div className="date-control"><input ref={finishRef} type="date" value={finish} disabled={type==="MILESTONE"} onChange={e=>setFinish(e.target.value)}/><button type="button" disabled={type==="MILESTONE"} aria-label="Open finish calendar" onClick={()=>openPicker(finishRef)}><CalendarDays size={15}/></button></div></label>
      <label className="wide"><span><Layers3 size={13}/> Parent / phase</span><div className="select-wrap"><select value={parentId} onChange={e=>setParentId(e.target.value)}><option value="">No parent — top level</option>{selectable.map(t=><option key={t.id} value={t.id}>{t.taskType==='SUMMARY'?'▰ ': '↳ '}{t.name}</option>)}</select><ChevronDown size={14}/></div></label>
    </div>
    {formError&&<div className="composer-error" role="alert">{formError}</div>}
    <footer><div className="hint"><kbd>Enter</kbd> create <kbd>Esc</kbd> close</div><div className="composer-actions"><button type="button" className="ghost-button" onClick={e=>{e.preventDefault();onClose()}}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving?<span className="spinner"/>:<Zap size={15}/>} {saving?'Creating…':'Create in orbit'}</button></div></footer>
  </form></div>
}
