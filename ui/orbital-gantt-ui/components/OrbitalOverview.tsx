"use client";
import { Activity, CalendarClock, Gauge, Link2, Maximize2, Minus, Network, Plus, ShieldAlert, Sparkles, Trash2, X, Target, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Task, Dependency, DependencyType } from "@/types/gantt";

type Point = { x: number; y: number };
type Props = {
  mode: "network" | "pulse";
  tasks: Task[];
  dependencies: Dependency[];
  onClose: () => void;
  onSelectTask?: (id: string) => void;
  onCreateTask?: (parentId?: string) => void;
  onCreateDependency?: (v: { predecessorId: string; successorId: string; dependencyType: DependencyType; lagDays: number }) => Promise<void>;
  onDeleteDependency?: (id: string) => Promise<void>;
  selectedTaskId?: string | null;
};

export function ScheduleIntelligenceOverview(props: Props) {
  return props.mode === "pulse" ? <PulseOverview {...props} /> : <NetworkOverview {...props} />;
}

function PulseOverview({ tasks, dependencies, onClose }: Props) {
  const critical = tasks.filter((t) => t.isCritical);
  const atRisk = tasks.filter((t) => t.targetFeasible === false);
  const milestones = tasks.filter((t) => t.taskType === "MILESTONE");
  const averageProgress = tasks.length ? Math.round(tasks.reduce((s, t) => s + (t.progressPct || 0), 0) / tasks.length) : 0;
  const activeDeps = dependencies.filter((d) => d.isActive);
  const health = Math.max(0, Math.min(100, 100 - atRisk.length * 12 - Math.max(0, critical.length - 3) * 4));
  const dates = tasks.flatMap((t) => [new Date(t.expectedStart).getTime(), new Date(t.expectedEnd).getTime()]).filter(Number.isFinite);
  const horizonDays = dates.length ? Math.max(0, Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000)) : 0;
  const criticalNames = critical.slice(0, 5).map((t) => t.name).join(" → ") || "No critical tasks";
  const earliestRisk = atRisk[0];
  return (
    <div className="overview-screen pulse-screen">
      <header className="overview-header">
        <div className="overview-heading">
          <div className="overview-icon"><Gauge size={20} /></div>
          <div><span className="eyebrow">SCHEDULE PULSE</span><h1>The plan, at a glance.</h1><p>Live signals from the deterministic schedule, dependency pressure and target feasibility.</p></div>
        </div>
        <button className="icon-button overview-close" aria-label="Close schedule pulse" title="Close" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="pulse-dashboard">
        <div className="pulse-hero"><div className="pulse-ring" style={{ "--health": `${health}%` } as React.CSSProperties}><strong>{health}</strong><span>HEALTH</span></div><div className="pulse-hero-copy"><span className="eyebrow">SCHEDULE INTELLIGENCE SIGNAL</span><h2>{health >= 85 ? "Schedule is holding." : health >= 65 ? "Watch the pressure." : "Intervention recommended."}</h2><p>{atRisk.length ? `${atRisk.length} task${atRisk.length === 1 ? " is" : "s are"} threatening target feasibility.` : "No task is currently marked infeasible against its target."}</p><div className="pulse-meter"><span style={{ width: `${health}%` }} /></div></div></div>
        <Signal label="Critical path" value={critical.length} hint="tasks driving finish" icon={<Network size={16} />} />
        <Signal label="Target risk" value={atRisk.length} hint="infeasible tasks" icon={<ShieldAlert size={16} />} />
        <Signal label="Progress" value={`${averageProgress}%`} hint="average completion" icon={<Activity size={16} />} />
        <div className="pulse-detail-card"><span className="eyebrow">DEPENDENCY PRESSURE</span><strong>{activeDeps.length}</strong><p>active relationships shaping the plan</p><div className="pulse-detail-line"><Link2 size={13} /><span>{critical.length} critical tasks connected</span></div></div>
        <div className="pulse-detail-card"><span className="eyebrow">SCHEDULE HORIZON</span><strong>{horizonDays}d</strong><p>from earliest start to latest finish</p><div className="pulse-detail-line"><CalendarClock size={13} /><span>{milestones.length} milestone{milestones.length === 1 ? "" : "s"} in the plan</span></div></div>
        <div className={`pulse-detail-card ${earliestRisk ? "pulse-risk" : ""}`}><span className="eyebrow">ATTENTION NEEDED</span><strong>{earliestRisk ? earliestRisk.name : "All clear"}</strong><p>{earliestRisk ? "Target feasibility is currently at risk." : "No target-feasibility breach detected."}</p><div className="pulse-detail-line"><Target size={13} /><span>{earliestRisk?.targetDate ? `Target ${new Date(earliestRisk.targetDate).toLocaleDateString()}` : "Targets are protected"}</span></div></div>
        <div className="pulse-chain"><div><span className="eyebrow">CRITICAL CHAIN</span><h3>{criticalNames}</h3><p>These work items currently have zero schedule slack. Changes upstream can propagate through this chain.</p></div><div className="chain-orbit"><Zap size={17} /><span>LIVE</span></div></div>
      </div>
    </div>
  );
}

function NetworkOverview({ tasks, dependencies, onClose, onSelectTask, onCreateTask, onCreateDependency, onDeleteDependency, selectedTaskId }: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [userZoom, setUserZoom] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [positions, setPositions] = useState<Map<string, Point> | null>(null);
  const [link, setLink] = useState<{ id: string; currentX: number; currentY: number } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);

  const displayTasks = useMemo(() => {
    if (tasks.length <= 180) return tasks;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const active = dependencies.filter((d) => d.isActive);
    const degree = new Map<string, number>();
    for (const d of active) { degree.set(d.predecessorId, (degree.get(d.predecessorId) || 0) + 1); degree.set(d.successorId, (degree.get(d.successorId) || 0) + 1); }
    const selected = new Set<string>();
    const addWithAncestors = (id:string) => { let cur = byId.get(id); while(cur && !selected.has(cur.id)){ selected.add(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined; } };
    if (selectedTaskId) addWithAncestors(selectedTaskId);
    tasks.filter((t) => t.isCritical).sort((a,b) => (degree.get(b.id)||0) - (degree.get(a.id)||0)).slice(0, 70).forEach(t => addWithAncestors(t.id));
    tasks.slice().sort((a,b) => (degree.get(b.id)||0) - (degree.get(a.id)||0)).slice(0, 55).forEach(t => addWithAncestors(t.id));
    if (selectedTaskId) active.forEach((d) => { if (d.predecessorId === selectedTaskId) addWithAncestors(d.successorId); if (d.successorId === selectedTaskId) addWithAncestors(d.predecessorId); });
    return [...selected].map(id => byId.get(id)).filter((t): t is Task => !!t).slice(0, 180);
  }, [tasks, dependencies, selectedTaskId]);

  const graph = useMemo(() => {
    const by = new Map(displayTasks.map((t) => [t.id, t]));
    const active = dependencies.filter((d) => d.isActive && by.has(d.predecessorId) && by.has(d.successorId));
    const hierarchyEdges = displayTasks.filter((t) => t.parentId && by.has(t.parentId)).map((t) => ({ id:`h:${t.parentId}:${t.id}`, parentId:t.parentId!, childId:t.id }));
    const depthMemo = new Map<string, number>();
    const depthOf = (id:string, trail=new Set<string>()):number => {
      if (depthMemo.has(id)) return depthMemo.get(id)!;
      const t=by.get(id); if(!t?.parentId || !by.has(t.parentId) || trail.has(id)){ depthMemo.set(id,0); return 0; }
      const d=depthOf(t.parentId,new Set([...trail,id]))+1; depthMemo.set(id,d); return d;
    };
    displayTasks.forEach(t=>depthOf(t.id));
    const cols = new Map<number, Task[]>();
    displayTasks.forEach((t) => { const c=depthMemo.get(t.id)||0; cols.set(c,[...(cols.get(c)||[]),t]); });
    const ordered=[...cols.keys()].sort((a,b)=>a-b);
    const maxRows=Math.max(1,...ordered.map(c=>(cols.get(c)||[]).length));
    const w=Math.max(1050,ordered.length*245+220);
    const h=Math.max(500,maxRows*122+180);
    const pos=new Map<string,Point>();
    ordered.forEach((c,ci)=>{
      const arr=cols.get(c)||[];
      arr.sort((a,b)=>(a.sortOrder-b.sortOrder)||a.expectedStart.localeCompare(b.expectedStart)||a.name.localeCompare(b.name));
      const columnHeight=Math.max(0,(arr.length-1)*122);
      const startY=Math.max(70,(h-columnHeight)/2);
      arr.forEach((t,ri)=>pos.set(t.id,{x:130+ci*245,y:startY+ri*122}));
    });
    return { active, hierarchyEdges, pos, w, h };
  }, [displayTasks, dependencies]);

  useEffect(() => {
    setPositions(null);
  }, [graph.w, graph.h, tasks.map((t) => t.id).join(",")]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const availableW = Math.max(280, rect.width - 28);
      const availableH = Math.max(260, rect.height - 28);
      const next = Math.min(1, availableW / graph.w, availableH / graph.h);
      setFitScale(Math.max(0.55, Number.isFinite(next) ? next : 1));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [graph.w, graph.h]);

  const scale = fitScale * userZoom;
  const pos = positions || graph.pos;

  const startNodeDrag = (e: React.PointerEvent, id: string) => {
    if ((e.target as HTMLElement).closest(".network-action")) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    const root = target.closest(".network-zoom") as HTMLElement | null;
    if (!root) return;
    const p = pos.get(id) || { x: 0, y: 0 };
    const rect = root.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / scale - p.x;
    const dy = (e.clientY - rect.top) / scale - p.y;
    const move = (ev: PointerEvent) => {
      const x = (ev.clientX - rect.left) / scale;
      const y = (ev.clientY - rect.top) / scale;
      const nx = Math.max(95, Math.min(graph.w - 95, x - dx));
      const ny = Math.max(60, Math.min(graph.h - 60, y - dy));
      setPositions((prev) => { const next = new Map(prev || graph.pos); next.set(id, { x: nx, y: ny }); return next; });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startLink = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const root = (e.currentTarget as HTMLElement).closest(".network-zoom") as HTMLElement | null;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    setLink({ id, currentX: (e.clientX - rect.left) / scale, currentY: (e.clientY - rect.top) / scale });
    const move = (ev: PointerEvent) => { setLink((prev) => prev ? { ...prev, currentX: (ev.clientX - rect.left) / scale, currentY: (ev.clientY - rect.top) / scale } : null); };
    const up = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      const target = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest("[data-network-target]") as HTMLElement | null;
      const successorId = target?.dataset.taskId;
      if (successorId && successorId !== id) { try { await onCreateDependency?.({ predecessorId: id, successorId, dependencyType: "FINISH_TO_START", lagDays: 0 }); } catch {} }
      setLink(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const reset = () => { setUserZoom(1); setPositions(null); };
  const scaledW = Math.max(1, graph.w * scale);
  const scaledH = Math.max(1, graph.h * scale);

  return (
    <div className="overview-screen network-screen">
      <header className="overview-header">
        <div className="overview-heading"><div className="overview-icon"><Network size={20} /></div><div><span className="eyebrow">PROJECT RELATIONSHIP NETWORK</span><h1>See structure and schedule forces together.</h1><p>{graph.hierarchyEdges.length} hierarchy links · {graph.active.length} scheduling dependencies · {tasks.filter((t) => t.isCritical).length} critical tasks · {displayTasks.length < tasks.length ? `focused view · ${displayTasks.length} of ${tasks.length} tasks` : "full view"} · <b className="network-legend-in">structure = parent / child</b> · <b className="network-legend-out">arrows = predecessor / successor</b></p></div></div>
        <div className="network-tools"><button onClick={() => setUserZoom((z) => Math.min(1.8, z + 0.1))} title="Zoom in" aria-label="Zoom in"><Plus size={15} /></button><button onClick={() => setUserZoom((z) => Math.max(0.75, z - 0.1))} title="Zoom out" aria-label="Zoom out"><Minus size={15} /></button><button onClick={reset} title="Fit network to viewport" aria-label="Fit network to viewport"><Maximize2 size={15} /></button><button className="icon-button overview-close" aria-label="Close dependency network" title="Close" onClick={onClose}><X size={19} /></button></div>
      </header>
      {selectedEdge && <div className="network-selection"><Link2 size={13} /><span>Dependency selected</span><button className="danger-button" onClick={async () => { const id = selectedEdge; setSelectedEdge(null); await onDeleteDependency?.(id); }}><Trash2 size={13} /> Remove link</button><button className="icon-button" onClick={() => setSelectedEdge(null)} aria-label="Dismiss dependency selection"><X size={14} /></button></div>}
      <div className="network-canvas" ref={canvasRef}>
        <div className="network-space" style={{ width: scaledW, height: scaledH }}>
          <div className="network-zoom" style={{ width: graph.w, height: graph.h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <svg width={graph.w} height={graph.h} className="network-edges" aria-hidden="true">
              <defs><marker id="network-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor" /></marker></defs>
              {graph.hierarchyEdges.map((h) => {
                const a=pos.get(h.parentId), b=pos.get(h.childId); if(!a||!b)return null;
                const x1=a.x+90,y1=a.y,x2=b.x-90,y2=b.y,mid=Math.max(55,Math.abs(x2-x1)*.35);
                return <g key={h.id} className="network-hierarchy-group"><path d={`M ${x1} ${y1} C ${x1+mid} ${y1}, ${x2-mid} ${y2}, ${x2} ${y2}`} className="network-hierarchy-edge"/><circle cx={x2} cy={y2} r="3" className="network-hierarchy-dot"/><g className="network-edge-label hierarchy" transform={`translate(${(x1+x2)/2-27} ${(y1+y2)/2-11})`}><rect width="54" height="22" rx="11"/><text x="27" y="14" textAnchor="middle">PARENT</text></g></g>;
              })}
              {graph.active.map((d) => {
                const a = pos.get(d.predecessorId), b = pos.get(d.successorId); if (!a || !b) return null;
                const critical = !!(tasks.find((t) => t.id === d.predecessorId)?.isCritical && tasks.find((t) => t.id === d.successorId)?.isCritical);
                const incoming = selectedTaskId === d.successorId;
                const outgoing = selectedTaskId === d.predecessorId;
                const related = incoming || outgoing;
                const x1 = a.x + 90, y1 = a.y, x2 = b.x - 90, y2 = b.y, mid = Math.max(70, Math.abs(x2 - x1) * 0.45);
                const label = d.dependencyType === "FINISH_TO_START" ? "FS" : d.dependencyType === "START_TO_START" ? "SS" : d.dependencyType === "FINISH_TO_FINISH" ? "FF" : "SF";
                const labelX = (x1 + x2) / 2, labelY = (y1 + y2) / 2;
                return <g key={d.id} className={`network-edge-hit ${incoming ? "incoming" : ""} ${outgoing ? "outgoing" : ""} ${related ? "related" : ""}`} onClick={() => setSelectedEdge(d.id)}>
                  <path d={`M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`} className={`network-edge ${critical ? "critical" : ""}`} markerEnd="url(#network-arrow)" />
                  <circle cx={x2} cy={y2} r="3" className={`network-arrow-dot ${critical ? "critical" : ""}`} />
                  <g className={`network-edge-label ${related ? "related" : ""}`} transform={`translate(${labelX - 24} ${labelY - 12})`}>
                    <rect width="48" height="24" rx="12" />
                    <text x="24" y="10" textAnchor="middle">{label}{d.lagDays ? ` ${d.lagDays > 0 ? "+" : ""}${d.lagDays}d` : ""}</text>
                    {related && <text x="24" y="19" textAnchor="middle">{incoming ? "PREDECESSOR" : "SUCCESSOR"}</text>}
                  </g>
                </g>;
              })}
              {link && <path d={`M ${pos.get(link.id)?.x || 0} ${pos.get(link.id)?.y || 0} C ${((pos.get(link.id)?.x || 0) + link.currentX) / 2} ${pos.get(link.id)?.y || 0}, ${((pos.get(link.id)?.x || 0) + link.currentX) / 2} ${link.currentY}, ${link.currentX} ${link.currentY}`} className="network-link-draft" />}
            </svg>
            {displayTasks.map((task, index) => {
              const p = pos.get(task.id) || { x: 100, y: 80 };
              return <div key={task.id} data-network-target data-task-id={task.id} className={`network-card ${task.parentId ? "" : "root-node"} ${tasks.some(t=>t.parentId===task.id) ? "summary-node" : ""} ${task.isCritical ? "critical" : ""} ${task.targetFeasible === false ? "risk" : ""} ${selectedTaskId === task.id ? "selected" : ""}`} style={{ left: p.x - 90, top: p.y - 52 }} onPointerDown={(e) => startNodeDrag(e, task.id)} onClick={() => onSelectTask?.(task.id)} tabIndex={0}>
                <span className="network-card-index">{String(index + 1).padStart(2, "0")}</span><span className="network-card-id">{task.displayId || task.externalId || task.id}</span><strong>{task.name}</strong><small>{task.source ? `${task.source} · ` : ""}{task.taskType === "SUMMARY" ? "SUMMARY · " : ""}{task.isCritical ? "CRITICAL · " : ""}{task.slackDays ?? 0}d slack · {task.progressPct || 0}%</small><div className="network-link-summary"><span>← {graph.active.filter(d=>d.successorId===task.id).length} PREDECESSOR</span><span>{graph.active.filter(d=>d.predecessorId===task.id).length} SUCCESSOR →</span></div>
                <div className="network-actions"><button type="button" className="network-action network-add" aria-label={`Create task under ${task.name}`} title="Create task here" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onCreateTask?.(task.id); }}><Plus size={12} /></button><button type="button" className="network-action network-link" aria-label={`Link from ${task.name}`} title="Drag to link dependency" onPointerDown={(e) => startLink(e, task.id)}><Link2 size={11} /></button></div>
              </div>;
            })}
            {!tasks.length && <div className="overview-empty"><Sparkles size={18} /><strong>No work items yet</strong><span>Create tasks and dependencies to reveal the live schedule network.</span></div>}
          </div>
        </div>
      </div>
      <div className="network-hint"><Link2 size={12} /><span><b>+</b> create · <b>↗</b> link · drag nodes to arrange · click a dependency to inspect/remove</span></div>
    </div>
  );
}

function Signal({ label, value, hint, icon }: { label: string; value: string | number; hint: string; icon: React.ReactNode }) {
  return <div className="signal-card"><span className="signal-icon">{icon}</span><span className="eyebrow">{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}
