"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Link2, LocateFixed, Minus, Plus } from "lucide-react";
import type { Task, Dependency, DependencyType } from "@/types/gantt";
import type { TreeTask } from "@/lib/task-tree";
import { PX_PER_DAY, ROW_HEIGHT, parseDate, addDays, daysBetween, dateToX, toIsoDate, isWeekend } from "@/lib/timeline";

type DependencyDraft = { predecessorId:string; sourceAnchor:"start"|"finish"; x:number; y:number; currentX:number; currentY:number };
const anchorLabel = (type: DependencyType) => ({FINISH_TO_START:"FS",START_TO_START:"SS",FINISH_TO_FINISH:"FF",START_TO_FINISH:"SF"}[type]);
const dependencyAnchors = (type: DependencyType): ["start"|"finish", "start"|"finish"] => {
  switch (type) {
    case "FINISH_TO_START": return ["finish", "start"];
    case "START_TO_START": return ["start", "start"];
    case "FINISH_TO_FINISH": return ["finish", "finish"];
    case "START_TO_FINISH": return ["start", "finish"];
    default: return ["finish", "start"];
  }
};
const dependencyTypeForAnchors = (source:"start"|"finish", target:"start"|"finish"): DependencyType => source === "finish" && target === "start" ? "FINISH_TO_START" : source === "start" && target === "start" ? "START_TO_START" : source === "finish" && target === "finish" ? "FINISH_TO_FINISH" : "START_TO_FINISH";
const dependencyLabel = (d:Dependency) => `${anchorLabel(d.dependencyType)}${d.lagDays ? ` ${d.lagDays > 0 ? "+" : ""}${d.lagDays}d` : ""}`;
const taskSignal=(t:Task,overloadedTaskIds:string[])=>t.actualEnd==null&&new Date(t.expectedEnd).getTime()<Date.now()&&t.progressPct<100?"overdue":t.targetFeasible===false?"target-risk":t.isCritical?"critical":overloadedTaskIds.includes(t.id)?"resource-pressure":t.progressPct>=100?"complete":"on-track";

export function GanttChart({tasks,dependencies,onUpdateDates,onCreateDependency,onSelect,selectedId,pulseKey,changedTaskIds=[],overloadedTaskIds=[],scrollTop=0,onVerticalScroll}:{tasks:TreeTask[];dependencies:Dependency[];onUpdateDates:(taskId:string,start:string,end:string)=>void;onCreateDependency:(v:{predecessorId:string;successorId:string;dependencyType:DependencyType;lagDays:number})=>Promise<void>;onSelect:(taskId:string)=>void;selectedId:string|null;pulseKey:number;changedTaskIds?:string[];overloadedTaskIds?:string[];scrollTop?:number;onVerticalScroll?:(scrollTop:number)=>void}){
 const wrap=useRef<HTMLDivElement>(null);
 const applyingScrollRef=useRef(false);
 const lastScrollTopRef=useRef(0);
 const [drag,setDrag]=useState<{taskId:string;mode:"move"|"resize";startX:number;origStart:Date;origEnd:Date;liveStart:Date;liveEnd:Date}|null>(null);
 const [link,setLink]=useState<DependencyDraft|null>(null);
 const [zoom,setZoom]=useState(1);
 const [scrollLeft,setScrollLeft]=useState(0);
 useEffect(()=>{
   const el=wrap.current;
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
   const el=wrap.current;if(!el)return;
   const step=e.shiftKey?ROW_HEIGHT*5:ROW_HEIGHT;
   let delta=0;
   if(e.key==='ArrowDown')delta=step;
   else if(e.key==='ArrowUp')delta=-step;
   else if(e.key==='PageDown')delta=el.clientHeight*.85;
   else if(e.key==='PageUp')delta=-el.clientHeight*.85;
   else if(e.key==='Home'){e.preventDefault();el.scrollTop=0;handleVerticalScroll(0);return;}
   else if(e.key==='End'){e.preventDefault();const top=el.scrollHeight-el.clientHeight;el.scrollTop=Math.max(0,top);handleVerticalScroll(Math.max(0,top));return;}
   else return;
   e.preventDefault();
   const max=Math.max(0,el.scrollHeight-el.clientHeight);
   const top=Math.max(0,Math.min(max,el.scrollTop+delta));
   el.scrollTop=top;
   handleVerticalScroll(top);
 };
 const {timelineStart,timelineEnd}=useMemo(()=>{if(!tasks.length){const n=new Date();return {timelineStart:addDays(n,-7),timelineEnd:addDays(n,35)}}const starts=tasks.flatMap(t=>[t.expectedStart,t.actualStart].filter(Boolean).map(v=>parseDate(v as string).getTime()));const ends=tasks.flatMap(t=>[t.expectedEnd,t.actualEnd].filter(Boolean).map(v=>parseDate(v as string).getTime()));return {timelineStart:addDays(new Date(Math.min(...starts)),-5),timelineEnd:addDays(new Date(Math.max(...ends)),12)}},[tasks]);
 const totalDays=Math.max(1,daysBetween(timelineStart,timelineEnd)); const totalWidth=Math.max(totalDays*PX_PER_DAY*zoom,760); const height=Math.max(1,tasks.length*ROW_HEIGHT); const rowIndex=new Map(tasks.map((t,i)=>[t.id,i]));
 const toCanvasPoint=(clientX:number,clientY:number)=>{const el=wrap.current;if(!el)return{x:0,y:0};const r=el.getBoundingClientRect();return{x:clientX-r.left+el.scrollLeft,y:clientY-r.top+el.scrollTop}};
 function startDrag(e:React.MouseEvent,task:Task,mode:"move"|"resize"){if((task as TreeTask).hasChildren)return;e.preventDefault();e.stopPropagation();const a=parseDate(task.expectedStart),b=parseDate(task.expectedEnd);setDrag({taskId:task.id,mode,startX:e.clientX,origStart:a,origEnd:b,liveStart:a,liveEnd:b});const move=(ev:MouseEvent)=>setDrag(prev=>{if(!prev)return null;const days=Math.round((ev.clientX-e.clientX)/(PX_PER_DAY*zoom));if(mode==="move")return {...prev,liveStart:addDays(a,days),liveEnd:addDays(b,days)};const end=addDays(b,days);return {...prev,liveEnd:end<addDays(a,1)?addDays(a,1):end}});const up=()=>{window.removeEventListener("mousemove",move);window.removeEventListener("mouseup",up);setDrag(prev=>{if(!prev)return null;queueMicrotask(()=>onUpdateDates(prev.taskId,toIsoDate(prev.liveStart),toIsoDate(prev.liveEnd)));return null})};window.addEventListener("mousemove",move);window.addEventListener("mouseup",up)}
 function startLink(e:React.MouseEvent,task:Task,sourceAnchor:"start"|"finish"){e.preventDefault();e.stopPropagation();const row=rowIndex.get(task.id)??0;const anchorDate=sourceAnchor==="finish"?parseDate(task.expectedEnd):parseDate(task.expectedStart);const x=dateToX(anchorDate,timelineStart)*zoom;const y=row*ROW_HEIGHT+ROW_HEIGHT/2;const start=toCanvasPoint(e.clientX,e.clientY);setLink({predecessorId:task.id,sourceAnchor,x,y,currentX:start.x,currentY:start.y});const move=(ev:MouseEvent)=>{const p=toCanvasPoint(ev.clientX,ev.clientY);setLink(prev=>prev?{...prev,currentX:p.x,currentY:p.y}:null)};const up=async(ev:MouseEvent)=>{window.removeEventListener("mousemove",move);window.removeEventListener("mouseup",up);const hit=document.elementFromPoint(ev.clientX,ev.clientY) as HTMLElement|null;const target=hit?.closest("[data-dependency-target]") as HTMLElement|null;const successorId=target?.dataset.taskId;const explicitAnchor=hit?.closest("[data-dependency-anchor]")?.getAttribute("data-dependency-anchor") as "start"|"finish"|null;let targetAnchor=explicitAnchor;if(!targetAnchor&&target){const r=target.getBoundingClientRect();targetAnchor=ev.clientX<r.left+r.width/2?"start":"finish";} if(successorId&&successorId!==task.id){const kind=dependencyTypeForAnchors(sourceAnchor,targetAnchor||"start");try{await onCreateDependency({predecessorId:task.id,successorId,dependencyType:kind,lagDays:0})}catch{}}setLink(null)};window.addEventListener("mousemove",move);window.addEventListener("mouseup",up)}
 function jumpToday(){if(!wrap.current)return;wrap.current.scrollLeft=Math.max(0,dateToX(new Date(),timelineStart)*zoom-wrap.current.clientWidth*.35)}
 const dependencyGeometry=(d:Dependency)=>{const a=tasks.find(t=>t.id===d.predecessorId),b=tasks.find(t=>t.id===d.successorId);if(!a||!b)return null;const ar=rowIndex.get(a.id)!,br=rowIndex.get(b.id)!;const [source,target]=dependencyAnchors(d.dependencyType);const sourceDate=source==="finish"?parseDate(a.expectedEnd):parseDate(a.expectedStart);const targetDate=target==="finish"?parseDate(b.expectedEnd):parseDate(b.expectedStart);const x1=dateToX(sourceDate,timelineStart)*zoom,x2=dateToX(targetDate,timelineStart)*zoom,y1=ar*ROW_HEIGHT+ROW_HEIGHT/2,y2=br*ROW_HEIGHT+ROW_HEIGHT/2;const dir=x2>=x1?1:-1;const bend=Math.max(24,Math.abs(x2-x1)*.38);const c1=x1+dir*bend,c2=x2-dir*bend;return {a,b,x1,x2,y1,y2,c1,c2,source,target};};
 return <div className="gantt-chart-shell">
   <div className="gantt-header-viewport">
    <div className="gantt-header gantt-header-sticky" style={{width:totalWidth,minWidth:"100%",transform:`translateX(${-scrollLeft}px)`}}>
      <div className="gantt-header-band"><span className="gantt-header-caption">TIMELINE · DAILY SCALE</span><span className="gantt-signal-legend"><i className="signal-legend-dot on-track"/> on track <i className="signal-legend-dot target-risk"/> target risk <i className="signal-legend-dot critical"/> critical <i className="signal-legend-dot overdue"/> overdue <i className="signal-legend-dot resource-pressure"/> resource pressure</span><span className="gantt-header-legend"><i className="legend-in-dot"/> predecessor <i className="legend-out-dot"/> successor</span></div>
      <div className="gantt-date-band" aria-label="Daily timeline">
        {Array.from({length:totalDays},(_,i)=>{
          const d=addDays(timelineStart,i);
          const month=d.toLocaleDateString(undefined,{month:"short"});
          const monthYear=d.toLocaleDateString(undefined,{month:"long",year:"numeric"});
          const weekday=d.toLocaleDateString(undefined,{weekday:"short"});
          const showMonth=i===0 || d.getDate()===1;
          return <div className={`gantt-day ${isWeekend(d)?"weekend":""} ${d.toDateString()===new Date().toDateString()?"today":""}`} style={{left:i*PX_PER_DAY*zoom,width:PX_PER_DAY*zoom}} key={i}>
            {showMonth&&<span className="gantt-month-label">{monthYear}</span>}
            <span className="gantt-day-label"><b>{d.getDate()} {month}</b><small>{weekday}</small></span>
          </div>
        })}
      </div>
      <div className="gantt-quick-tools"><button onClick={()=>setZoom(z=>Math.max(.65,z-.1))} title="Zoom out"><Minus size={12}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.min(1.6,z+.1))} title="Zoom in"><Plus size={12}/></button><button onClick={jumpToday} title="Center on today"><LocateFixed size={12}/></button></div>
    </div>
   </div>
   <div className="gantt-chart-scroll" ref={wrap} tabIndex={0} aria-label="Gantt timeline" onScroll={e=>{setScrollLeft(e.currentTarget.scrollLeft);handleVerticalScroll(e.currentTarget.scrollTop)}} onKeyDown={handleKeyDown}>
    <div className="gantt-canvas" style={{width:totalWidth,minWidth:"100%"}}>
    <div className="gantt-grid" style={{minHeight:height}} onClick={()=>onSelect("")}>
      {Array.from({length:totalDays},(_,i)=>{const d=addDays(timelineStart,i);return isWeekend(d)?<div className="gantt-weekend" key={i} style={{left:i*PX_PER_DAY*zoom,width:PX_PER_DAY*zoom,height}}/>:null})}
      <div className="today-line" style={{left:dateToX(new Date(),timelineStart)*zoom,height}}/>
      <div className="gantt-rows">{tasks.map((_,i)=><div className="gantt-row-line" style={{top:i*ROW_HEIGHT,height:ROW_HEIGHT}} key={i}/>)}</div>
      <svg className="gantt-dependencies" width={totalWidth} height={height}>
        <defs><marker id="si-dep-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="currentColor"/></marker></defs>
        {dependencies.filter(d=>d.isActive).map((d,depIndex)=>{
          const g=dependencyGeometry(d);
          if(!g)return null;
          const critical=g.a.isCritical&&g.b.isCritical;
          const incoming=selectedId===d.successorId;
          const outgoing=selectedId===d.predecessorId;
          const related=incoming||outgoing;
          const t=incoming?0.42:outgoing?0.58:0.5;
          const omt=1-t;
          const lx=omt*omt*omt*g.x1+3*omt*omt*t*g.c1+3*omt*t*t*g.c2+t*t*t*g.x2;
          const ly=omt*omt*omt*g.y1+3*omt*omt*t*g.y1+3*omt*t*t*g.y2+t*t*t*g.y2;
          const stagger=(depIndex%3-1)*11;
          return <g key={`${d.id}-${pulseKey}`} className={`gantt-dependency-group ${incoming?"incoming":""} ${outgoing?"outgoing":""} ${related?"related":""}`}>
            <path d={`M${g.x1} ${g.y1} C${g.c1} ${g.y1}, ${g.c2} ${g.y2}, ${g.x2} ${g.y2}`} className={critical?"gantt-dep-critical":"gantt-dep"} markerEnd="url(#si-dep-arrow)"/>
            <g className={`gantt-dep-label-svg ${critical?"critical":""} ${related?"related":""}`} transform={`translate(${lx-25} ${ly-10+stagger})`}>
              <rect width="50" height="20" rx="10"/>
              <text x="25" y="13" textAnchor="middle">{dependencyLabel(d)}</text>
            </g>
            <title>{`${g.a.name} → ${g.b.name} · ${d.dependencyType.replaceAll("_TO_"," → ")} · lag ${d.lagDays}d · ${incoming?"predecessor":outgoing?"successor":"dependency"}`}</title>
          </g>
        })}
        {link&&<path d={`M${link.x} ${link.y} C${link.x+60} ${link.y}, ${link.currentX-40} ${link.currentY}, ${link.currentX} ${link.currentY}`} className="gantt-link-draft"/>}
      </svg>
      {tasks.map((t,i)=>{const active=drag?.taskId===t.id;const s=active?drag!.liveStart:parseDate(t.expectedStart),e=active?drag!.liveEnd:parseDate(t.expectedEnd);const left=dateToX(s,timelineStart)*zoom,width=Math.max(PX_PER_DAY*.65*zoom,dateToX(e,timelineStart)*zoom-left),milestone=t.taskType==="MILESTONE";const actualStart=t.actualStart?parseDate(t.actualStart):null;const actualEnd=t.actualEnd?parseDate(t.actualEnd):actualStart?new Date():null;const actualLeft=actualStart?dateToX(actualStart,timelineStart)*zoom-left:0;const actualWidth=actualStart&&actualEnd?Math.max(5,dateToX(actualEnd,timelineStart)*zoom-dateToX(actualStart,timelineStart)*zoom):0;return <div key={t.id} className={`gantt-bar-wrap ${t.hasChildren?"summary-task":""} signal-${taskSignal(t,overloadedTaskIds)} ${selectedId===t.id?"selected":""} ${link?.predecessorId===t.id?"linking":""} ${changedTaskIds.includes(t.id)?"schedule-changed":""}`} data-dependency-target data-task-id={t.id} style={{left,top:i*ROW_HEIGHT+8,width:milestone?ROW_HEIGHT-16:width,height:ROW_HEIGHT-16}} onClick={ev=>{ev.stopPropagation();onSelect(t.id)}}>
        {actualStart&&actualWidth>0&&<div className={`gantt-actual-bar ${t.actualEnd?"complete":"ongoing"}`} style={{left:actualLeft,width:actualWidth}} title={`Actual: ${actualStart.toLocaleDateString()} → ${t.actualEnd?actualEnd!.toLocaleDateString():"ongoing"}`}/>}
        {milestone?<button aria-label={`Move ${t.name}`} className={`gantt-milestone ${t.isCritical?"critical":""}`} onMouseDown={e=>startDrag(e,t,"move")}/>:<button className={`gantt-bar ${t.hasChildren?"summary-bar":""} ${taskSignal(t,overloadedTaskIds)} ${t.isCritical?"critical":""}`} onMouseDown={e=>startDrag(e,t,"move")}>
          <span className="gantt-progress" style={{width:`${Math.max(0,Math.min(100,t.progressPct||0))}%`}}/><b><span className="gantt-task-id">{t.displayId || t.externalId || t.id}</span><span className="gantt-task-name">{t.name}</span></b><i onMouseDown={e=>{e.stopPropagation();startDrag(e,t,"resize")}}/>
          <span className="dependency-port dependency-port-start" data-dependency-anchor="start" onMouseDown={e=>startLink(e,t,"start")} title="Drag from task start">{link?.predecessorId===t.id&&link.sourceAnchor==="start"?<Link2 size={9}/>:<ChevronDown size={8}/>}</span>
          <span className="dependency-port dependency-port-finish" data-dependency-anchor="finish" onMouseDown={e=>startLink(e,t,"finish")} title="Drag from task finish"><Link2 size={9}/></span>
        </button>}
        {milestone&&<><span className="dependency-port dependency-port-start milestone-port-start" data-dependency-anchor="start" onMouseDown={e=>startLink(e,t,"start")}><Link2 size={9}/></span><span className="dependency-port dependency-port-finish milestone-port-finish" data-dependency-anchor="finish" onMouseDown={e=>startLink(e,t,"finish")}><Link2 size={9}/></span></>}
      </div>})}
      <div className="gantt-link-hint">{link?<><Link2 size={12}/> Drag to a <b>start</b> or <b>finish</b> anchor · creates {anchorLabel(dependencyTypeForAnchors(link.sourceAnchor,"start"))}/{anchorLabel(dependencyTypeForAnchors(link.sourceAnchor,"finish"))}</>:<><Link2 size={12}/> Drag from task <b>start</b> or <b>finish</b> to another task anchor to choose SS / SF / FS / FF</>}</div>
    </div>
   </div>
 </div>
   </div>
}
