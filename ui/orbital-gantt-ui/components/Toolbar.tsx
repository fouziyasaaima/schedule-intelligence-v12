"use client";
import { Plus, Link2, Trash2, Sparkles, RefreshCw, ChevronDown } from "lucide-react";
import type { Project } from "@/types/gantt";

interface Props {
  projectName:string; projects:Project[]; projectId:string; onProjectChange:(id:string)=>void; onAi:()=>void;
  onAddTask:()=>void; onAddDependency:()=>void; onDelete:()=>void; onDeleteProject:()=>void; onDeleteRecoveryProject:()=>void; onToggleInsights:()=>void; onRecompute:()=>void;
  deleteDisabled:boolean; recomputing:boolean; recoveryProjectExists:boolean;
}
export function Toolbar({projectName,projects,projectId,onProjectChange,onAi,onAddTask,onAddDependency,onDelete,onDeleteProject,onDeleteRecoveryProject,onToggleInsights,onRecompute,deleteDisabled,recomputing,recoveryProjectExists}:Props){
 return <div className="schedule-toolbar" style={styles.bar}>
  <div style={styles.left}>
   <div style={styles.mark}/>
   <label className="project-switcher" title="Switch project"><select value={projectId} onChange={e=>onProjectChange(e.target.value)} aria-label="Select project">{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><ChevronDown size={12}/></label>
   <span className="project-context"><b>{projectName}</b><small>{projects.length} project{projects.length===1?"":"s"}</small></span>
  </div>
  <div style={styles.actions}>
   <ToolButton icon={<Plus size={14}/>} label="Add task" onClick={onAddTask}/><ToolButton icon={<Link2 size={14}/>} label="Link" onClick={onAddDependency}/><ToolButton icon={<Trash2 size={14}/>} label="Delete task" onClick={onDelete} disabled={deleteDisabled}/><ToolButton icon={<Trash2 size={14}/>} label="Delete project" onClick={onDeleteProject}/><ToolButton icon={<Trash2 size={14}/>} label="Remove blocked project" onClick={onDeleteRecoveryProject} disabled={!recoveryProjectExists}/><div style={styles.divider}/><ToolButton icon={<RefreshCw size={14} className={recomputing?"spin":undefined}/>} label="Recompute" onClick={onRecompute}/><ToolButton icon={<Sparkles size={14}/>} label="Insights" onClick={onToggleInsights}/><ToolButton icon={<Sparkles size={14}/>} label="MAC" onClick={onAi} accent/>
  </div>
 </div>
}
function ToolButton({icon,label,onClick,disabled,accent}:{icon:React.ReactNode;label:string;onClick:()=>void;disabled?:boolean;accent?:boolean}){return <button onClick={onClick} disabled={disabled} style={{...styles.button,opacity:disabled?.35:1,cursor:disabled?"not-allowed":"pointer",color:accent?"var(--cyan)":"var(--text-dim)"}} title={label}>{icon}<span style={styles.buttonLabel}>{label}</span></button>}
const styles:Record<string,React.CSSProperties>={bar:{height:48,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",borderBottom:"1px solid var(--border)",background:"var(--panel)",flexShrink:0},left:{display:"flex",alignItems:"center",gap:10,minWidth:0},mark:{width:8,height:8,borderRadius:"50%",background:"var(--amber)",boxShadow:"0 0 8px var(--amber)",flexShrink:0},actions:{display:"flex",alignItems:"center",gap:2,overflowX:"auto"},divider:{width:1,height:20,background:"var(--border)",margin:"0 6px"},button:{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",padding:"7px 9px",borderRadius:4,fontSize:12,transition:"background 0.12s var(--ease)",whiteSpace:"nowrap"},buttonLabel:{}};
