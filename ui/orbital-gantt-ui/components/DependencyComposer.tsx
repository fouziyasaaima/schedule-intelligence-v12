"use client";
import { useState } from "react";
import { ArrowRight, ChevronDown, Link2, X } from "lucide-react";
import type { Task, DependencyType } from "@/types/gantt";

const TYPES:Array<{id:DependencyType;short:string;label:string;hint:string}>= [
 {id:"FINISH_TO_START",short:"FS",label:"Finish → Start",hint:"Most common sequence"},
 {id:"START_TO_START",short:"SS",label:"Start → Start",hint:"Start together / overlap"},
 {id:"FINISH_TO_FINISH",short:"FF",label:"Finish → Finish",hint:"Finish together"},
 {id:"START_TO_FINISH",short:"SF",label:"Start → Finish",hint:"Successor finishes after start"},
];

export function DependencyComposer({open,tasks,selectedId,onClose,onCreate}:{open:boolean;tasks:Task[];selectedId:string|null;onClose:()=>void;onCreate:(v:{predecessorId:string;successorId:string;dependencyType:DependencyType;lagDays:number})=>Promise<void>}){
 const [pred,setPred]=useState("");const [kind,setKind]=useState<DependencyType>("FINISH_TO_START");const [lag,setLag]=useState(0);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const succ=selectedId||"";
 if(!open)return null;
 const submit=async()=>{
  setError("");
  if(!pred){setError("Select a predecessor task first.");return;}
  if(!succ){setError("Select a successor task first.");return;}
  if(pred===succ){setError("A task cannot depend on itself. Select two different tasks.");return;}
  if(!Number.isFinite(lag)){setError("Enter a valid lag / lead value.");return;}
  setBusy(true);
  try{await onCreate({predecessorId:pred,successorId:succ,dependencyType:kind,lagDays:lag});onClose();}
  catch(e){setError(e instanceof Error?e.message:"The dependency could not be created. Please review the selected tasks and try again.");}
  finally{setBusy(false);}
};
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}><div className="composer compact dependency-composer">
   <header><div><span className="eyebrow">DEPENDENCY DESIGNER</span><h2>Connect the work.</h2><p>Choose exactly how one task constrains another. The schedule engine propagates the relationship immediately.</p></div><button className="icon-button" onClick={onClose} aria-label="Close dependency designer"><X size={18}/></button></header>
   <div className="dependency-flow"><div><small>PREDECESSOR</small><div className="select-wrap"><select value={pred} onChange={e=>setPred(e.target.value)}><option value="">Choose task…</option>{tasks.filter(t=>t.id!==succ).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><ChevronDown size={14}/></div></div><ArrowRight size={22}/><div><small>SUCCESSOR</small><div className="flow-task">{tasks.find(t=>t.id===succ)?.name||"Select a successor task first"}</div></div></div>
   <div className="relationship-picker"><div className="relationship-picker-head"><span>RELATIONSHIP</span><b>{TYPES.find(t=>t.id===kind)?.label}</b></div><div className="relationship-grid">{TYPES.map(t=><button type="button" key={t.id} className={kind===t.id?"selected":""} onClick={()=>setKind(t.id)}><strong>{t.short}</strong><span>{t.label}</span><small>{t.hint}</small></button>)}</div></div>
   <div className="field-grid"><label><span>Lag / lead (days)</span><input type="number" value={lag} onChange={e=>setLag(Number(e.target.value)||0)} placeholder="0"/><small className="field-help">Positive = lag · negative = lead</small></label><div className="dependency-preview"><span className="eyebrow">SCHEDULE EFFECT</span><strong>{kind==="FINISH_TO_START"?"Successor starts after predecessor finishes":kind==="START_TO_START"?"Both tasks start together":kind==="FINISH_TO_FINISH"?"Both tasks finish together":"Successor finish follows predecessor start"}</strong></div></div>
   <footer><div className="hint"><Link2 size={13}/> {pred&&succ?`${TYPES.find(t=>t.id===kind)?.short} relationship ready to apply`:`Choose both tasks to link them`}</div><div className="composer-actions"><button className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy} onClick={()=>void submit()}><Link2 size={15}/> {busy?"Applying…":`Apply ${TYPES.find(t=>t.id===kind)?.short} link`}</button></div></footer>{error&&<div className="dependency-error" role="alert" aria-live="assertive"><strong>Dependency not created</strong><span>{error}</span></div>}
 </div></div>
}
