"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Command, LogOut, Orbit, Sparkles, Sun, Moon, BarChart3, X } from "lucide-react";
import { notify } from "@/lib/notifications";
import { useConnection } from "@/lib/connection";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api-client";
import type { Task, Dependency, Project, TaskType, DependencyType } from "@/types/gantt";
import { buildVisibleTaskTree } from "@/lib/task-tree";
import { Toolbar } from "./Toolbar";
import { TaskSidebar } from "./TaskSidebar";
import { GanttChart } from "./GanttChart";
import { InsightRail } from "./InsightRail";
import { AppRail, RailView } from "./AppRail";
import { TaskComposer } from "./TaskComposer";
import { DependencyComposer } from "./DependencyComposer";
import { ResourceOrbit } from "./ResourceOrbit";
import { MonteCarloPanel } from "./MonteCarloPanel";
import { ImpactPanel } from "./ImpactPanel";
import { ScheduleIntelligenceOverview } from "./OrbitalOverview";
import { RecoveryPanel } from "./RecoveryPanel";
import { IntelligenceHub } from "./IntelligenceHub";
import { ConnectorHub } from "./ConnectorHub";
import { MacPanel } from "./MacPanel";
import { ExportCenter } from "./ExportCenter";
import { ImportCenter } from "./ImportCenter";
import { APP_VERSION } from "@/lib/version";

type RecomputeSummary = {
  projectId?: string; taskCount:number; dependencyCount?:number; criticalTaskCount:number; changedTaskCount:number; movedTaskCount?:number; criticalChanges?:number;
  changedTasks:Array<{taskId:string;taskName:string;startShiftDays:number;finishShiftDays:number;oldSlack?:number|null;slackDays:number;oldIsCritical?:boolean|null;isCritical:boolean;targetFeasible?:boolean|null}>;
  computedAt:string; dependencyLinked?:boolean;
};

export function GanttWorkspace() {
  const { config } = useConnection();
  const { logout } = useAuth();
  const [project,setProject]=useState<Project|null>(null),[projects,setProjects]=useState<Project[]>([]),[activeProjectId,setActiveProjectId]=useState<string|null>(null),[collapsedIds,setCollapsedIds]=useState<Set<string>>(new Set()),[verticalScrollTop,setVerticalScrollTop]=useState(0),[tasks,setTasks]=useState<Task[]>([]),[dependencies,setDependencies]=useState<Dependency[]>([]),[selectedId,setSelectedId]=useState<string|null>(null),[insightsOpen,setInsightsOpen]=useState(false),[pulseKey,setPulseKey]=useState(0),[recomputing,setRecomputing]=useState(false),[recomputeSummary,setRecomputeSummary]=useState<RecomputeSummary|null>(null),[changedTaskIds,setChangedTaskIds]=useState<string[]>([]),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true),[railView,setRailView]=useState<RailView>("schedule"),[railExpanded,setRailExpanded]=useState(false),[taskComposer,setTaskComposer]=useState(false),[dependencyComposer,setDependencyComposer]=useState(false),[commandOpen,setCommandOpen]=useState(false),[simulationOpen,setSimulationOpen]=useState(false),[impactOpen,setImpactOpen]=useState(false),[overviewOpen,setOverviewOpen]=useState<"network"|"pulse"|null>(null),[intelligenceOpen,setIntelligenceOpen]=useState(false),[taskParentId,setTaskParentId]=useState(""),[recoveryOpen,setRecoveryOpen]=useState(false),[resourceFocusId,setResourceFocusId]=useState<string|null>(null),[theme,setTheme]=useState<"dark"|"light">("dark"),[creatingProject,setCreatingProject]=useState(false),[overloadedTaskIds,setOverloadedTaskIds]=useState<string[]>([]),[aiOpen,setAiOpen]=useState(false),[importOpen,setImportOpen]=useState(false),[aiAlertIds,setAiAlertIds]=useState<string[]>([]);
  const loadAll=useCallback(async(projectId?:string)=>{
    if(!config)return;
    try{
      setError(null);
      setLoading(true);
      const list=await api.listProjects(config);
      setProjects(list);
      if(!list.length){
        setProject(null);setTasks([]);setDependencies([]);setOverloadedTaskIds([]);
        return;
      }
      // Recovery rule: never make the known problematic quick-start project the
      // automatic landing project. If the current project is unavailable or is
      // the known recovery project, select another healthy project first.
      const RECOVERY_PROJECT_NAME = "SI-Quick-Start-Schedule";
      const currentId=projectId||activeProjectId;
      const current=list.find(x=>x.id===currentId);
      const safeProject=list.find(x=>x.name.trim().toLowerCase()!==RECOVERY_PROJECT_NAME.toLowerCase());
      const p=(current && current.name.trim().toLowerCase()!==RECOVERY_PROJECT_NAME.toLowerCase())
        ? current
        : (safeProject || current || list[0]);

      // Critical path: tasks are the schedule. Do not make the Gantt wait for
      // resource leveling or dependency intelligence.
      const t=await api.listTasks(config,p.id);
      const sorted=t.sort((a,b)=>a.sortOrder-b.sortOrder);
      setProject(p);
      setActiveProjectId(p.id);
      setTasks(sorted);
      setLoading(false);
      setPulseKey(k=>k+1);

      // Intelligence is deliberately progressive. A slow/large dependency or
      // resource query must never leave the primary schedule in "Loading".
      void api.listDependencies(config,p.id)
        .then(d=>{setDependencies(d);setPulseKey(k=>k+1);})
        .catch(e=>setError(e instanceof ApiError?`Dependencies: ${e.status}: ${e.message}`:"Dependencies could not be loaded. The schedule remains usable."));

      void api.getProjectResourceLeveling(config,p.id)
        .then(level=>setOverloadedTaskIds((level?.resources||[]).filter((r:any)=>r.overloaded).flatMap((r:any)=>r.assignments?.map((a:any)=>a.taskId)||[])))
        .catch(()=>setOverloadedTaskIds([]));
    }catch(e){
      setError(e instanceof ApiError?`API ${e.status}: ${e.message}`:e instanceof TypeError?e.message:e instanceof Error?e.message:"Failed to load project data");
      setLoading(false);
    }
  },[config,activeProjectId]);
  useEffect(()=>{void loadAll()},[loadAll]);
  useEffect(()=>{ if(!project||!config)return; const timer=window.setInterval(()=>{void api.aiAlerts(config,project.id).then((items:any[])=>{const ids=items.map(x=>x.id);const fresh=ids.filter(id=>!aiAlertIds.includes(id));if(fresh.length){const top=items.find(x=>fresh.includes(x.id));if(top) notify({kind:"warning",title:"AI schedule signal",message:String(top.payload?.title||"A material schedule signal needs attention."),id:`ai-alert:${top.id}`,durationMs:9000});setAiAlertIds(ids)}}).catch(()=>undefined)},60000); return()=>window.clearInterval(timer)},[project?.id,config,aiAlertIds]);
  useEffect(()=>{const savedRail=window.localStorage.getItem("orbital-rail-expanded"); if(savedRail) setRailExpanded(savedRail === "true"); const saved=window.localStorage.getItem("orbital-theme") as "dark"|"light"|null; const next=saved||"dark"; setTheme(next); document.documentElement.dataset.theme=next},[]);
  function toggleRail(){const next=!railExpanded;setRailExpanded(next);window.localStorage.setItem("orbital-rail-expanded",String(next))}
  function toggleTheme(){const next=theme==="dark"?"light":"dark";setTheme(next);document.documentElement.dataset.theme=next;window.localStorage.setItem("orbital-theme",next)}
  useEffect(()=>{const fn=()=>{setIntelligenceOpen(false);setOverviewOpen(null);setImpactOpen(false);setRecoveryOpen(false);setRailView("schedule");setSimulationOpen(true)};window.addEventListener("si:open-forecast",fn);return()=>window.removeEventListener("si:open-forecast",fn)},[]);
  useEffect(()=>{const fn=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setCommandOpen(v=>!v)}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="n"){e.preventDefault();setTaskComposer(true)}if(e.key==="Escape"){setCommandOpen(false);setTaskComposer(false);setDependencyComposer(false)}};window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn)},[]);
  if(!config)return null;
  const activeConfig = config;
  async function switchProject(id:string){ if(!id||id===activeProjectId)return; setSelectedId(null); setAiOpen(false); setCollapsedIds(new Set()); setActiveProjectId(id); }
  async function updateDates(taskId:string,start:string,end:string){
    const previous=tasks.find(t=>t.id===taskId);
    const beforeTasks=tasks;
    setTasks(prev=>prev.map(t=>t.id===taskId?{...t,expectedStart:start,expectedEnd:end,isManualSchedule:true}:t));
    try{
      await api.updateTask(activeConfig,taskId,{expectedStart:start,expectedEnd:end,isManualSchedule:true});
      if(project){
        // Refresh the schedule immediately. Dependency/resource intelligence
        // is allowed to arrive independently and cannot block the Gantt.
        const freshTasks=await api.listTasks(activeConfig,project.id);
        const sorted=freshTasks.sort((a,b)=>a.sortOrder-b.sortOrder);
        const moved=sorted.filter(t=>{
          const old=beforeTasks.find(x=>x.id===t.id);
          return !!old&&(old.expectedStart!==t.expectedStart||old.expectedEnd!==t.expectedEnd);
        });
        setTasks(sorted);
        setPulseKey(k=>k+1);
        if(moved.length){setChangedTaskIds(moved.map(t=>t.id));setTimeout(()=>setChangedTaskIds([]),6500);}
        void api.listDependencies(activeConfig,project.id)
          .then(d=>setDependencies(d))
          .catch(()=>undefined);
      }
    }catch(e){
      if(previous)setTasks(prev=>prev.map(t=>t.id===taskId?previous:t));
      setError(e instanceof ApiError
        ? `Schedule change rejected and rolled back: ${e.message}`
        : "Schedule change could not be applied and was rolled back.");
    }
  }
  async function createProject(){setCreatingProject(true);try{const start=new Date();start.setHours(0,0,0,0);const p=await api.createProject(activeConfig,{name:"My First Schedule",startDate:start.toISOString()});setProject(p);await loadAll()}catch(e){setError(e instanceof ApiError?e.message:"Failed to create project")}finally{setCreatingProject(false)}}
  async function createTask(v:{name:string;taskType:TaskType;expectedStart:string;expectedEnd:string;parentId?:string}){if(!project)throw new Error("Create a project first.");try{await api.createTask(activeConfig,project.id,v);await loadAll()}catch(e){setError(e instanceof ApiError?e.message:"Failed to create task");throw e}}
  async function createDependency(v:{predecessorId:string;successorId:string;dependencyType:DependencyType;lagDays:number}){if(!project)throw new Error("Create a project first.");try{const result=await api.createDependency(activeConfig,project.id,v);const summary=result.schedule;if(summary){setRecomputeSummary({...summary,dependencyLinked:true});setChangedTaskIds(summary.changedTasks.map(t=>t.taskId));setTimeout(()=>setChangedTaskIds([]),6500);setTimeout(()=>setRecomputeSummary(null),9000)}await loadAll()}catch(e){setError(e instanceof ApiError?e.message:"Failed to create dependency");throw e}}
  async function deleteDependency(id:string){try{await api.deleteDependency(activeConfig,id);await loadAll()}catch(e){setError(e instanceof ApiError?e.message:"Failed to remove dependency")}}
  async function deleteSelected(){if(!selectedId)return;try{await api.deleteTask(activeConfig,selectedId);setSelectedId(null);await loadAll()}catch(e){setError(e instanceof ApiError?e.message:"Failed to delete task")}}
  async function deleteRecoveryProject(){
    const blocked=projects.find(p=>p.name.trim().toLowerCase()==="si-quick-start-schedule".toLowerCase());
    if(!blocked)return;
    if(!window.confirm(`Remove the blocked recovery project "${blocked.name}"? This cannot be undone.`))return;
    try{
      await api.deleteProject(activeConfig,blocked.id);
      setSelectedId(null);
      setActiveProjectId(null);
      await loadAll();
    }catch(e){
      setError(e instanceof ApiError?e.message:"Failed to remove the blocked project");
    }
  }
  async function deleteProject(){
    if(!project)return;
    const name=project.name;
    if(!window.confirm(`Delete project "${name}" and all of its schedule data? This cannot be undone.`))return;
    try{
      await api.deleteProject(activeConfig,project.id);
      setSelectedId(null);
      setActiveProjectId(null);
      await loadAll();
    }catch(e){
      setError(e instanceof ApiError?e.message:"Failed to delete project");
    }
  }
  async function recompute(){if(!project)return;setRecomputing(true);setRecomputeSummary(null);try{const result=await api.recompute(activeConfig,project.id);setRecomputeSummary(result);setChangedTaskIds(result.changedTasks.map(t=>t.taskId));await loadAll();setTimeout(()=>setChangedTaskIds([]),6500);setTimeout(()=>setRecomputeSummary(null),9000)}catch(e){setError(e instanceof ApiError?e.message:"Recompute failed")}finally{setRecomputing(false)}}
  const visibleTasks=useMemo(()=>buildVisibleTaskTree(tasks,collapsedIds),[tasks,collapsedIds]);
  const toggleTask=(id:string)=>setCollapsedIds(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next});
  const selectedTask=tasks.find(t=>t.id===selectedId)||null; const critical=tasks.filter(t=>t.isCritical).length; const atRisk=tasks.filter(t=>t.targetFeasible===false).length;
  async function handleOpenImportedProject(id:string){
    setRailView("schedule"); setSelectedId(null); setActiveProjectId(id); await loadAll(id);
    try {
      const m=await api.macStatus(activeConfig);
      if(m.autonomousScheduling){
        const r=await api.aiSchedule(activeConfig,id,"autonomous");
        notify({kind:"success",title:"MAC completed the imported schedule",message:`${r.dependenciesApplied||0} dependencies and ${r.datesApplied||0} expected-date changes applied safely.`});
        await loadAll(id);
      }
    } catch(e){ setError(e instanceof ApiError?e.message:"MAC could not complete the automatic schedule pass"); }
  }
  return <div className={`orbital-shell ${railExpanded ? "rail-is-expanded" : "rail-is-collapsed"}`} data-theme={theme}>
   <AppRail active={railView} onChange={(v)=>{setRailView(v); setIntelligenceOpen(false); setOverviewOpen(null); setSimulationOpen(false); setImpactOpen(false); setRecoveryOpen(false); if(v==="forecast")setSimulationOpen(true); if(v==="impact")setImpactOpen(true); if(v==="network")setOverviewOpen("network"); if(v==="pulse")setOverviewOpen("pulse"); if(v==="intelligence")setIntelligenceOpen(true); if(v!=="resources")setResourceFocusId(null)}} onCommand={()=>setCommandOpen(true)} expanded={railExpanded} onToggle={toggleRail}/><main className="orbital-main">
    <div className="topbar"><div className="topbar-title"><Orbit size={18} className="top-orbit"/><div><span className="eyebrow">Schedule Intelligence GANTT</span><strong>{project?.name||"Loading schedule"}</strong></div><span className="app-version-badge" title={`Schedule Intelligence ${APP_VERSION}`}>v{APP_VERSION}</span></div><div className="top-status"><span className="live-dot"/>LIVE SCHEDULE <span className="status-divider"/><span>{tasks.length} tasks</span><span>{critical} critical</span>{atRisk>0&&<span className="risk-pill">{atRisk} target risk</span>}<button className="top-command" onClick={()=>{setIntelligenceOpen(false);setOverviewOpen(null);setImpactOpen(false);setRecoveryOpen(false);setRailView("forecast");setSimulationOpen(true)}} title="Monte Carlo forecast"><BarChart3 size={14}/><span className="theme-action-label">Forecast</span></button>{project&&<ExportCenter config={activeConfig} project={project} tasks={tasks} dependencies={dependencies}/>}<button className="top-command" onClick={toggleTheme} title={theme==="dark"?"Switch to light mode":"Switch to dark mode"}>{theme==="dark"?<Sun size={14}/>:<Moon size={14}/>}</button><button className="top-command" onClick={()=>setCommandOpen(true)}><Command size={14}/><kbd>⌘K</kbd></button><button className="logout" onClick={()=>void logout()} title="Sign out"><LogOut size={15}/></button></div></div>
    {railView === "connectors" ? (importOpen ? <ImportCenter config={config} onClose={()=>setImportOpen(false)} onImported={async id=>{setImportOpen(false);setRailView("schedule");await loadAll(id);}}/> : <ConnectorHub config={config} onClose={()=>setRailView("schedule")} onOpenProject={handleOpenImportedProject} onOpenImport={()=>setImportOpen(true)}/>) : intelligenceOpen ? <IntelligenceHub config={config} projectId={project!.id} onSelectTask={setSelectedId} onOpenForecast={()=>{setIntelligenceOpen(false);setOverviewOpen(null);setImpactOpen(false);setRecoveryOpen(false);setRailView("forecast");setSimulationOpen(true)}} onOpenResource={(id)=>{setIntelligenceOpen(false);setOverviewOpen(null);setImpactOpen(false);setRecoveryOpen(false);setResourceFocusId(id);setRailView("resources")}} onClose={()=>{setIntelligenceOpen(false);setRailView("schedule")}}/> : overviewOpen ? <ScheduleIntelligenceOverview mode={overviewOpen} tasks={tasks} dependencies={dependencies} selectedTaskId={selectedId} onSelectTask={setSelectedId} onCreateTask={(parentId)=>{setTaskParentId(parentId||"");setOverviewOpen(null);setRailView("schedule");setTaskComposer(true)}} onCreateDependency={createDependency} onDeleteDependency={deleteDependency} onClose={()=>{setOverviewOpen(null);setRailView("schedule")}}/> : railView==="resources" ? <ResourceOrbit config={config} tasks={tasks} projectId={project?.id} projectName={project?.name} initialResourceId={resourceFocusId} onScheduleChanged={()=>void loadAll(project?.id)} onClose={()=>{setResourceFocusId(null);setRailView("schedule")}} onError={setError}/> : <>
      <Toolbar projectName={project?.name??"Loading…"} projects={projects} projectId={project?.id??""} onProjectChange={(id)=>void switchProject(id)} onAi={()=>setAiOpen(true)} onAddTask={()=>setTaskComposer(true)} onAddDependency={()=>{if(!selectedId)setError("Select a successor task first.");else setDependencyComposer(true)}} onDelete={()=>void deleteSelected()} onDeleteProject={()=>void deleteProject()} onDeleteRecoveryProject={()=>void deleteRecoveryProject()} recoveryProjectExists={projects.some(p=>p.name.trim().toLowerCase()==="si-quick-start-schedule")} onToggleInsights={()=>setInsightsOpen(v=>!v)} onRecompute={()=>void recompute()} deleteDisabled={!selectedId} recomputing={recomputing}/>
      {error&&<div className="error-bar"><div><strong>Schedule Intelligence signal</strong><span>{error}</span></div><button onClick={()=>setError(null)}>×</button></div>}
      {recomputeSummary&&<div className="recompute-result"><div className="recompute-orb"><Sparkles size={16}/></div><div className="recompute-copy"><strong>{recomputeSummary.dependencyLinked?"Dependency applied · schedule propagated":"Schedule intelligence pass complete"}</strong><span>{recomputeSummary.movedTaskCount?`${recomputeSummary.movedTaskCount} task${recomputeSummary.movedTaskCount===1?"":"s"} moved; ${recomputeSummary.criticalChanges||0} critical-path change${(recomputeSummary.criticalChanges||0)===1?"":"s"}.`:`No dates needed adjustment. ${recomputeSummary.changedTaskCount} schedule signal${recomputeSummary.changedTaskCount===1?"":"s"} refreshed.`}</span></div><div className="recompute-mini"><b>{recomputeSummary.movedTaskCount||0}</b><small>moved</small></div><div className="recompute-mini"><b>{recomputeSummary.criticalTaskCount}</b><small>critical</small></div><button aria-label="Dismiss recompute result" onClick={()=>setRecomputeSummary(null)}>×</button></div>}
      <div className="workspace-stage">{loading?<div className="schedule-loading"><div className="loading-orbit"><Orbit/></div><strong>Aligning the schedule…</strong><span>Loading tasks, dependencies and computed signals</span></div>:!project?<div className="schedule-empty"><div className="loading-orbit"><Orbit/></div><strong>Your workspace is ready.</strong><span>Create your first schedule and start analyzing delivery risk, dependencies and resources.</span><button className="primary-button" onClick={()=>void createProject()} disabled={creatingProject}>{creatingProject?"Creating…":"Create first schedule"}</button></div>:<><TaskSidebar scrollTop={verticalScrollTop} onVerticalScroll={setVerticalScrollTop} tasks={visibleTasks} allTasks={tasks} collapsedIds={collapsedIds} onToggleCollapse={toggleTask} dependencies={dependencies} onUpdateDates={updateDates} overloadedTaskIds={overloadedTaskIds} onUpdateDependency={async(id,patch)=>{try{await api.updateDependency(activeConfig,id,patch);await loadAll()}catch(e){setError(e instanceof ApiError?e.message:"Failed to update dependency")}}} onSelect={setSelectedId} selectedId={selectedId}/><GanttChart scrollTop={verticalScrollTop} onVerticalScroll={setVerticalScrollTop} tasks={visibleTasks} dependencies={dependencies} onUpdateDates={updateDates} onCreateDependency={createDependency} onSelect={setSelectedId} selectedId={selectedId} pulseKey={pulseKey} changedTaskIds={changedTaskIds} overloadedTaskIds={overloadedTaskIds}/></>}{insightsOpen&&<InsightRail task={selectedTask} tasks={tasks} dependencies={dependencies} config={config} onClose={()=>setInsightsOpen(false)}/>}</div>
    </>}
   {aiOpen&&project&&<MacPanel config={config} projectId={project.id} projectName={project.name} selectedTask={selectedTask} onSelectTask={setSelectedId} onScheduleChanged={()=>void loadAll(project.id)} onClose={()=>setAiOpen(false)}/>}
   </main>
   {simulationOpen&&project&&<MonteCarloPanel config={config} projectId={project.id} onOpenNetwork={()=>{setSimulationOpen(false);setOverviewOpen("network");setRailView("network")}} onClose={()=>{setSimulationOpen(false);setRailView("schedule")}}/>}{recoveryOpen&&project&&<RecoveryPanel config={config} projectId={project.id} tasks={tasks} onClose={()=>{setRecoveryOpen(false);setRailView("schedule")}}/>}{impactOpen&&project&&<ImpactPanel config={config} projectId={project.id} tasks={tasks} selectedId={selectedId} onClose={()=>{setImpactOpen(false);setRailView("schedule")}}/>}<TaskComposer open={taskComposer} tasks={tasks} initialParentId={taskParentId} onClose={()=>{setTaskComposer(false);setTaskParentId("")}} onCreate={createTask}/><DependencyComposer open={dependencyComposer} tasks={tasks} selectedId={selectedId} onClose={()=>setDependencyComposer(false)} onCreate={createDependency}/>
   {commandOpen&&<div className="command-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setCommandOpen(false)}}><div className="command-palette"><div className="command-search"><Command size={17}/><input autoFocus placeholder="Command Schedule Intelligence…" onKeyDown={e=>{if(e.key==="Enter")setTaskComposer(true)}}/><button type="button" className="command-close" aria-label="Close command palette" title="Close" onClick={()=>setCommandOpen(false)}><X size={17}/></button></div><div className="command-section">QUICK ACTIONS</div><button onClick={()=>{setCommandOpen(false);setTaskComposer(true)}}><Sparkles size={16}/><span><b>Create task</b><small>Put a new work item into orbit</small></span><kbd>⌘N</kbd></button><button onClick={()=>{setCommandOpen(false);setRailView("resources")}}><Orbit size={16}/><span><b>Open Resource Orbit</b><small>See capacity and people behind the plan</small></span></button><button onClick={()=>{setCommandOpen(false);void recompute()}}><Orbit size={16}/><span><b>Recompute schedule</b><small>Recalculate critical path and slack</small></span></button></div></div>}
  </div>
}
