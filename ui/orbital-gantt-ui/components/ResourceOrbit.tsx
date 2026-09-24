"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Gauge,
  Orbit,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  Cpu,
  Building2,
  Car,
  Boxes,
  UsersRound,
  X,
  BrainCircuit,
  ListFilter,
  CheckCircle2,
  AlertTriangle,
  Layers3,
  CalendarDays,
  ChevronRight,
  Save,
  WandSparkles,
  Zap,
  Clock3,
} from "lucide-react";
import type { ApiConfig } from "@/lib/api-client";
import { ApiError, api } from "@/lib/api-client";
import type { Resource, Task, ResourceType } from "@/types/gantt";

type Workload = {
  allocatedHoursPerDay: number;
  peakAllocationPct: number;
  assignments: number;
  taskIds: string[];
  assignmentIds: string[];
  windows: Array<{assignmentId:string;taskId:string;taskName:string;start:string;end:string;allocationPct:number;role?:string|null}>;
};

type WorkloadResource = Resource & {
  load: number;
  allocatedHoursPerDay: number;
  assignmentCount: number;
};

const EMPTY_WORKLOAD: Workload = {allocatedHoursPerDay:0,peakAllocationPct:0,assignments:0,taskIds:[],assignmentIds:[],windows:[]};

export function ResourceOrbit({
  config,
  tasks,
  onClose,
  onError,
  initialResourceId,
  projectId,
  projectName,
  onScheduleChanged,
}: {
  config: ApiConfig;
  tasks: Task[];
  onClose: () => void;
  onError: (message: string) => void;
  initialResourceId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  onScheduleChanged?: () => void;
}) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"orbit" | "schedule" | "timeline" | "impact">(tasks.length >= 1000 ? "schedule" : "orbit");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Resource | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [resourceType, setResourceType] = useState<ResourceType>("PERSON");
  const [capacityUnits, setCapacityUnits] = useState("1");
  const [unitLabel, setUnitLabel] = useState("unit");
  const [availability, setAvailability] = useState("100");
  const [saving, setSaving] = useState(false);
  const [workloads, setWorkloads] = useState<Record<string, Workload>>({});
  const [intelligence, setIntelligence] = useState<any>(null);
  const [orbitRadius, setOrbitRadius] = useState(150);
  const scopedProjectId = projectId || tasks[0]?.projectId || "";
  const constellationRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      if (!scopedProjectId) {
        setResources([]);
        setWorkloads({});
        setLoading(false);
        return;
      }

      // The resource roster is the primary UI. Show it as soon as it is
      // available; workload/intelligence is progressive for large projects.
      const next = await api.listProjectResources(config, scopedProjectId);
      setResources(next);
      if (initialResourceId) {
        const focus = next.find((resource) => resource.id === initialResourceId);
        if (focus) setSelected(focus);
      }
      setLoading(false);

      void Promise.all([
        api.getProjectResourceLeveling(config, scopedProjectId),
        api.resourceIntelligence(config, scopedProjectId).catch(() => null),
      ]).then(([leveling, material]) => {
        setIntelligence(material);
        const byResource = new Map(leveling.resources.map((item) => [item.resourceId, item]));
        const entries = next.map((resource) => {
          const item = byResource.get(resource.id);
          if (!item) return [resource.id, EMPTY_WORKLOAD] as const;
          const value: Workload = {
            allocatedHoursPerDay: item.capacityHoursPerDay * Math.max(0, item.allocationPct) / 100,
            peakAllocationPct: item.allocationPct || 0,
            assignments: item.assignments.length,
            taskIds: item.assignments.map((assignment) => assignment.taskId),
            assignmentIds: [],
            windows: item.assignments.map((assignment, index) => ({
              assignmentId: `${resource.id}-${index}`,
              taskId: assignment.taskId,
              taskName: assignment.taskName,
              start: assignment.start,
              end: assignment.end,
              allocationPct: assignment.allocationPct,
              role: assignment.role ?? null
            })),
          };
          return [resource.id, value] as const;
        });
        setWorkloads(Object.fromEntries(entries));
      }).catch(() => {
        // Resource cards remain usable even if intelligence is temporarily slow.
      });
    } catch (e) {
      const message =
        e instanceof ApiError
          ? `Resources: ${e.status} — ${e.message}`
          : e instanceof TypeError
            ? "Resources: network/CORS error — check API URL and CORS_ORIGINS."
            : "Resources: unable to reach Schedule Intelligence API";
      setError(message);
      onError(message);
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Connection changes are the only external inputs that require a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.baseUrl, initialResourceId, scopedProjectId]);

  const filtered = useMemo(
    () =>
      resources.filter((resource) =>
        `${resource.name} ${resource.role || ""}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [resources, query],
  );

  const totalCapacity = resources.reduce((total, resource) => total + resource.capacityHoursPerDay, 0);

  const workload = useMemo<WorkloadResource[]>(
    () =>
      resources.map((resource) => {
        const current = workloads[resource.id] || EMPTY_WORKLOAD;
        return {
          ...resource,
          load: Math.round(current.peakAllocationPct),
          allocatedHoursPerDay: current.allocatedHoursPerDay,
          assignmentCount: current.assignments,
        };
      }),
    [resources, workloads],
  );

  async function add() {
    if (!name.trim()) return;

    setSaving(true);
    try {
      await api.createResource(config, {
        name: name.trim(),
        role: role.trim() || undefined,
        type: resourceType,
        capacityHoursPerDay: Number(capacity) || 8,
        capacityUnits: Number(capacityUnits) || 1,
        unitLabel: unitLabel.trim() || "unit",
        availabilityPct: Math.max(0, Math.min(100, Number(availability) || 100)),
        projectId: scopedProjectId,
      });
      setName("");
      setRole("");
      setCapacity("8");
      setResourceType("PERSON");
      setCapacityUnits("1");
      setUnitLabel("unit");
      setAvailability("100");
      setCreating(false);
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Failed to create resource");
    } finally {
      setSaving(false);
    }
  }

  async function remove(resource: Resource) {
    try {
      await api.deleteResource(config, resource.id);
      if (selected?.id === resource.id) setSelected(null);
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Failed to delete resource");
    }
  }

  const resourceCount = Math.max(1, Math.min(12, filtered.length));

  useEffect(() => {
    const node = constellationRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const radius = Math.max(82, Math.min(filtered.length > 8 ? 205 : 175, Math.min(rect.width, rect.height) * 0.31));
      setOrbitRadius(Math.round(radius));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length]);

  return (
    <div className="resource-screen">
      <header className="resource-header">
        <div className="resource-title">
          <div className="orbit-logo">
            <OrbitGlyph />
          </div>
          <div>
            <span className="eyebrow">RESOURCE ORBIT</span>
            <h1>Everything that powers the plan.</h1>
            <p>People, equipment, facilities, vehicles and other capacity — scheduled as first-class resources.</p>
          </div>
        </div>

        <div className="resource-actions">
          <div className="resource-search">
            <Search size={15} />
            <input
              placeholder="Find a resource…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="ghost-button" onClick={() => void load()}>
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Sync
          </button>
          <button className="primary-button" onClick={() => setCreating(true)}>
            <Plus size={15} /> Add resource
          </button>
          <button className="icon-button" onClick={onClose} aria-label="Close resources">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="resource-modes">
        {(
          [
            ["orbit", "Orbit", Sparkles],
            ["schedule", "Schedule", BrainCircuit],
            ["timeline", "Timeline", Activity],
            ["impact", "Impact", Gauge],
          ] as const
        ).map(([id, label, Icon]) => (
          <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}>
            <Icon size={14} />
            {label}
          </button>
        ))}
        <div className="resource-metrics">
          {intelligence?.largeDataset && <span className="resource-scale-pill"><Layers3 size={11}/> MATERIALITY MODE</span>}
          <span>
            <b>{resources.length}</b> resources
          </span>
          <span>
            <b>{totalCapacity}</b>h/day capacity
          </span>
          <span>
            <b>{filtered.length}</b> visible
          </span>
        </div>
      </div>

      {creating && (
        <div className="resource-create">
          <div className="resource-create-title">
            <span className="eyebrow">NEW RESOURCE</span>
            <strong>Add to {projectName || "selected project"}</strong>
            <small>This resource will be scoped to this project only.</small>
          </div>
          <label>
            <span>Resource name</span>
            <input aria-label="Resource name" placeholder="e.g. MC, CNC Machine 01" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>Resource type</span>
            <select value={resourceType} onChange={(event) => setResourceType(event.target.value as ResourceType)} aria-label="Resource type">
              {(["PERSON","EQUIPMENT","FACILITY","VEHICLE","MATERIAL","TEAM","OTHER"] as ResourceType[]).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>
            <span>Role / purpose <em>optional</em></span>
            <input aria-label="Role or purpose" placeholder="e.g. Project Manager / Test Rig" value={role} onChange={(event) => setRole(event.target.value)} />
          </label>
          <label>
            <span>Capacity <em>hours/day</em></span>
            <input aria-label="Capacity hours per day" type="number" min="0.5" max="24" step="0.5" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
          </label>
          <label>
            <span>Available units</span>
            <input aria-label="Available units" type="number" min="0.1" step="0.1" value={capacityUnits} onChange={(event) => setCapacityUnits(event.target.value)} />
          </label>
          <label>
            <span>Unit label</span>
            <input aria-label="Unit label" placeholder="person, machine, vehicle…" value={unitLabel} onChange={(event) => setUnitLabel(event.target.value)} />
          </label>
          <label>
            <span>Availability <em>percent</em></span>
            <input aria-label="Availability percent" type="number" min="0" max="100" step="1" value={availability} onChange={(event) => setAvailability(event.target.value)} />
          </label>
          <button className="primary-button resource-create-add" disabled={saving || !name.trim() || !scopedProjectId} onClick={() => void add()}>
            {saving ? <span className="spinner" /> : <Plus size={14} />} Add to project
          </button>
          <button className="icon-button" onClick={() => setCreating(false)} aria-label="Cancel" title="Cancel">
            <X size={16} />
          </button>
        </div>
      )}

      {error ? (
        <div className="resource-error">
          <div>
            <strong>Resource channel disconnected</strong>
            <span>{error}</span>
            <small>Verify the Schedule Intelligence API is reachable and its CORS_ORIGINS includes this UI origin.</small>
          </div>
          <button className="primary-button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="resource-loading">
          <div className="loading-orbit">
            <OrbitGlyph />
          </div>
          <strong>Synchronizing the constellation…</strong>
          <span>Finding capacity nodes and workload signals</span>
        </div>
      ) : mode === "orbit" ? (
        <div className="constellation-wrap">
          <div className="constellation" ref={constellationRef}>
            <div className="constellation-core">
              <Sparkles size={20} />
              <strong>PLAN</strong>
              <span>{tasks.length} work items</span>
            </div>
            <div className="constellation-ring r1" />
            <div className="constellation-ring r2" />
            <div className="constellation-ring r3" />

            {filtered.slice(0, 12).map((resource, index) => {
              const angle = `${(index / resourceCount) * 360}deg`;
              const style: React.CSSProperties & { "--angle"?: string; "--radius"?: string } = {
                "--angle": angle,
                "--radius": `${orbitRadius}px`,
              };

              return (
                <button
                  key={resource.id}
                  className={`orbit-resource ${selected?.id === resource.id ? "selected" : ""}`}
                  style={style}
                  onClick={() => setSelected(resource)}
                >
                  <span className="resource-dot">
                    <ResourceIcon type={resource.type} size={15} />
                  </span>
                  <b>{resource.name}</b>
                  <small>{resource.externalId ? `ID ${resource.externalId} · ` : ""}{resource.type} · {resource.role || "Resource"}</small>
                </button>
              );
            })}
          </div>

          {selected && (
            <ResourceDetail
              resource={selected}
              tasks={tasks}
              assignedIds={workloads[selected.id]?.taskIds || []}
              config={config}
              onRefresh={() => void load()}
              onClose={() => setSelected(null)}
              onDelete={() => void remove(selected)}
              onError={onError}
              intelligence={intelligence}
            />
          )}
        </div>
      ) : mode === "schedule" ? (
        <ResourceScheduleBoard
          config={config}
          projectId={scopedProjectId}
          tasks={tasks}
          resources={workload}
          intelligence={intelligence}
          onSelect={(resource) => setSelected(resource)}
          onRefresh={() => void load()}
          onScheduleChanged={onScheduleChanged}
        />
      ) : mode === "timeline" ? (
        <div className="resource-timeline">
          {workload.map((resource) => {
            const windows=workloads[resource.id]?.windows||[];
            const projectStart=Math.min(...tasks.map(t=>new Date(t.expectedStart).getTime()),Date.now());
            const projectEnd=Math.max(...tasks.map(t=>new Date(t.expectedEnd).getTime()),projectStart+86400000);
            const span=Math.max(1,projectEnd-projectStart);
            return <button key={resource.id} className="timeline-resource" onClick={() => setSelected(resource)}>
              <div className="timeline-person"><span className="resource-avatar"><ResourceIcon type={resource.type} size={14}/></span><span><b>{resource.name}</b><small>{resource.role || "Resource"}</small></span></div>
              <div className="timeline-track"><span className="capacity-line"/>{windows.map(w=>{const left=Math.max(0,Math.min(100,(new Date(w.start).getTime()-projectStart)/span*100));const width=Math.max(2,Math.min(100-left,(new Date(w.end).getTime()-new Date(w.start).getTime())/span*100));return <i key={w.assignmentId} title={`${w.taskName}${w.role?` · ${w.role}`:""} · ${w.allocationPct}%`} style={{left:`${left}%`,width:`${width}%`}}/>})}</div>
              <strong>{resource.load}%</strong>
            </button>;
          })}
        </div>
      ) : (
        <div className="impact-grid">
          {workload.map((resource) => (
            <button key={resource.id} className="impact-card" onClick={() => setSelected(resource)}>
              <div className="impact-head">
                <span className="resource-avatar">
                  <UserRound size={14} />
                </span>
                <span>
                  <b>{resource.name}</b>
                  <small>{resource.externalId ? `ID ${resource.externalId} · ` : ""}{resource.type} · {resource.role || "Resource"}</small>
                </span>
                <span className={resource.load > 100 ? "impact-hot" : "impact-ok"}>
                  {resource.load > 100 ? "OVERLOAD" : "HEALTHY"}
                </span>
              </div>
              <div className="impact-number">
                {resource.load}
                <small>%</small>
              </div>
              <div className="impact-label">workload signal</div>
              <div className="impact-bar">
                <i style={{ width: `${Math.min(100, resource.load)}%` }} />
              </div>
              <div className="impact-foot">
                <span>{resource.capacityHoursPerDay}h/day</span>
                <span>{resource.assignmentCount} assigned tasks</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && mode !== "orbit" && (
        <ResourceDetail
          resource={selected}
          tasks={tasks}
          assignedIds={workloads[selected.id]?.taskIds || []}
          config={config}
          onRefresh={() => void load()}
          onClose={() => setSelected(null)}
          onDelete={() => void remove(selected)}
          onError={onError}
          intelligence={intelligence}
        />
      )}
    </div>
  );
}


function ResourceScheduleBoard({
  config,
  projectId,
  tasks,
  resources,
  intelligence,
  onSelect,
  onRefresh,
  onScheduleChanged,
}: {
  config: ApiConfig;
  projectId: string;
  tasks: Task[];
  resources: WorkloadResource[];
  intelligence: any;
  onSelect: (resource: Resource) => void;
  onRefresh: () => void;
  onScheduleChanged?: () => void;
}) {
  const [filter, setFilter] = useState<"needs" | "pressure" | "all">("needs");
  const [query, setQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [macOpen, setMacOpen] = useState(false);
  const [macBusy, setMacBusy] = useState(false);
  const [macResult, setMacResult] = useState<any>(null);
  const [macError, setMacError] = useState("");
  const material = Array.isArray(intelligence?.materialTasks) ? intelligence.materialTasks : [];
  const taskMap = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  const normalized = useMemo(() => tasks.map(task => {
    const assigned = Boolean(task.resourceAssignments?.length);
    const materialItem = material.find((m:any) => m.id === task.id);
    return {
      ...task,
      assigned,
      critical: materialItem?.critical ?? task.isCritical ?? false,
      slackDays: materialItem?.slackDays ?? task.slackDays,
      targetRisk: materialItem?.targetRisk ?? task.targetFeasible === false,
      overdue: materialItem?.overdue ?? false,
    };
  }), [tasks, material]);
  const unassigned = useMemo(() => normalized.filter(t => !t.assigned && t.taskType !== "SUMMARY"), [normalized]);
  const pressure = useMemo(() => resources.filter(r => r.load >= 80).sort((a,b) => b.load-a.load), [resources]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = filter === "needs" ? unassigned : filter === "all" ? normalized.filter(t => t.taskType !== "SUMMARY") : [];
    return source
      .filter((t:any) => !q || `${t.name} ${t.status} ${t.displayId || ""}`.toLowerCase().includes(q))
      .sort((a:any,b:any) => {
        if (filter === "needs") return (Number(b.critical)-Number(a.critical)) || ((a.slackDays ?? 999) - (b.slackDays ?? 999));
        return a.sortOrder - b.sortOrder;
      })
      .slice(0, filter === "all" ? 120 : 80);
  }, [filter, unassigned, normalized, query]);
  const large = tasks.length >= 1000 || resources.length >= 60;

  async function runMac(mode: "recommend" | "autonomous") {
    setMacBusy(true);
    setMacError("");
    try {
      const instruction = "Prioritize unscheduled and overloaded work. Propose practical dates, dependency-safe sequencing, and resource assignments using only resources already available to this project. Prefer minimal disruption and explain the highest-impact changes.";
      const result = await api.aiSchedule(config, projectId, mode, instruction);
      setMacResult(result);
      if (mode === "autonomous" && result.status === "APPLIED") {
        onRefresh();
        onScheduleChanged?.();
      }
    } catch (e) {
      setMacError(e instanceof ApiError ? `${e.status}: ${e.message}` : e instanceof Error ? e.message : "MAC scheduling failed");
    } finally {
      setMacBusy(false);
    }
  }

  async function applyMac() {
    if (!macResult?.runId) return;
    setMacBusy(true);
    setMacError("");
    try {
      const result = await api.aiScheduleApply(config, projectId, macResult.runId);
      setMacResult((prev:any) => ({ ...prev, ...result, status: "APPLIED" }));
      onRefresh();
      onScheduleChanged?.();
    } catch (e) {
      setMacError(e instanceof ApiError ? `${e.status}: ${e.message}` : e instanceof Error ? e.message : "Unable to apply MAC schedule");
    } finally {
      setMacBusy(false);
    }
  }

  return <div className="resource-schedule-board">
    <div className="schedule-command-bar">
      <div className="schedule-command-copy">
        <span className="eyebrow">SCHEDULING HUB</span>
        <strong>{large ? "Work the exceptions, not the task universe." : "Schedule work without opening the entire task universe."}</strong>
        <small>{unassigned.length.toLocaleString()} need scheduling · {pressure.filter(r=>r.load>100).length} overloaded resources · {tasks.length.toLocaleString()} total work items</small>
      </div>
      <div className="schedule-command-actions">
        <div className="resource-task-search"><Search size={13}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find work…"/></div>
        <button className={filter === "needs" ? "active" : ""} onClick={()=>setFilter("needs")}><AlertTriangle size={13}/> Needs scheduling <b>{unassigned.length}</b></button>
        <button className={filter === "pressure" ? "active" : ""} onClick={()=>setFilter("pressure")}><Gauge size={13}/> Resource pressure</button>
        <button className={filter === "all" ? "active" : ""} onClick={()=>setFilter("all")}><ListFilter size={13}/> All work</button>
        <button className="mac-schedule-primary" onClick={()=>{setMacOpen(true);setMacResult(null);setMacError("");}}><WandSparkles size={13}/> Schedule with MAC</button>
      </div>
    </div>
    <div className="schedule-summary-strip">
      <button className="schedule-summary-action" onClick={()=>setFilter("all")}><b>{tasks.length.toLocaleString()}</b><span>work items</span></button>
      <button className="schedule-summary-action attention" onClick={()=>setFilter("needs")}><b>{unassigned.length.toLocaleString()}</b><span>need scheduling</span></button>
      <button className="schedule-summary-action" onClick={()=>setFilter("needs")}><b>{normalized.filter(t=>t.critical).length.toLocaleString()}</b><span>critical</span></button>
      <button className="schedule-summary-action pressure" onClick={()=>setFilter("pressure")}><b>{pressure.filter(r=>r.load>100).length}</b><span>overloaded</span></button>
      <button className="schedule-summary-action" onClick={()=>setFilter("pressure")}><b>{resources.length}</b><span>resources</span></button>
    </div>
    <div className="schedule-board-grid">
      <section className="schedule-work-queue">
        <div className="schedule-section-head"><div><span className="eyebrow">WORK QUEUE</span><strong>{filter === "needs" ? "Next decisions" : filter === "pressure" ? "Capacity pressure" : "All schedulable work"}</strong></div><span>{filter === "pressure" ? pressure.length : candidates.length}{filter === "all" && normalized.length > 120 ? "+" : ""}</span></div>
        <div className="schedule-work-list">
          {filter === "pressure"
            ? pressure.slice(0, 30).map(resource => (
                <button className="schedule-resource-row" key={resource.id} onClick={() => onSelect(resource)}>
                  <span className="resource-avatar"><ResourceIcon type={resource.type} size={14}/></span>
                  <span><b>{resource.name}</b><small>{resource.assignmentCount} assigned · {resource.capacityHoursPerDay}h/day</small></span>
                  <strong className={resource.load > 100 ? "hot" : ""}>{resource.load}%</strong>
                </button>
              ))
            : candidates.map((item:any) => {
                const task = taskMap.get(item.id);
                if (!task) return null;
                return <button className="schedule-task-row schedule-task-action" key={item.id} onClick={() => setSelectedTask(task)}>
                  <span className={item.critical ? "task-signal critical" : "task-signal"}/>
                  <span className="schedule-task-copy">
                    <b>{item.name}</b>
                    <small>{item.critical ? "Critical · " : ""}{item.slackDays ?? "—"}d slack · {item.status}{item.resourceAssignments?.length ? ` · ${item.resourceAssignments.length} resource${item.resourceAssignments.length === 1 ? "" : "s"}` : " · needs resource"}</small>
                  </span>
                  <span className="schedule-task-action-label"><CalendarDays size={13}/> Schedule <ChevronRight size={12}/></span>
                </button>;
              })}
          {filter !== "pressure" && !candidates.length && <div className="schedule-empty-state"><CheckCircle2 size={20}/><strong>No immediate scheduling queue.</strong><span>The schedule is currently covered. Switch to All Work to browse everything or let MAC run a planning pass.</span><button className="ghost-button" onClick={()=>{setMacOpen(true);setMacResult(null);}}>Open MAC scheduling</button></div>}
        </div>
      </section>
      <aside className="schedule-resource-rail">
        <div className="schedule-section-head"><div><span className="eyebrow">RESOURCE PULSE</span><strong>Where capacity is moving</strong></div></div>
        {resources.slice().sort((a,b)=>b.load-a.load).slice(0,8).map(r=><button key={r.id} className="schedule-resource-card" onClick={()=>onSelect(r)}><div><span className="resource-avatar"><ResourceIcon type={r.type} size={13}/></span><span><b>{r.name}</b><small>{r.assignmentCount} assigned · {r.capacityHoursPerDay}h/day</small></span></div><strong className={r.load>100?"hot":r.load>=80?"warm":""}>{r.load}%</strong><i><em style={{width:`${Math.min(100,r.load)}%`}}/></i></button>)}
        {!resources.length && <div className="schedule-empty-mini"><span>No project resources yet.</span><button className="ghost-button" onClick={()=>onSelect(resources[0] as any)} disabled>Use Add resource above</button></div>}
      </aside>
    </div>
    <div className="schedule-action-hint"><CalendarDays size={14}/><span><b>Click any work item to schedule it.</b> Set dates, assign a resource, and save. Or use MAC to produce a reviewable schedule proposal for the project.</span></div>
    {large && <div className="schedule-large-data-note"><BrainCircuit size={15}/><span><b>Large-data mode is active.</b> SI ranks exceptions and keeps the full task universe available through search and All Work. The browser is not asked to render thousands of decision cards at once.</span></div>}

    {selectedTask && <ScheduleActionDrawer config={config} projectId={projectId} task={selectedTask} resources={resources} onClose={()=>setSelectedTask(null)} onSaved={()=>{setSelectedTask(null);onRefresh();onScheduleChanged?.();}} />}

    {macOpen && <div className="schedule-modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setMacOpen(false)}}>
      <section className="schedule-mac-modal">
        <header><div><span className="eyebrow">MAC SCHEDULING</span><h2><WandSparkles size={18}/> Turn recommendations into an actual schedule.</h2><p>MAC will analyze the selected project, propose safe dates/dependencies/resource moves, and let you review before applying them.</p></div><button className="icon-button" onClick={()=>setMacOpen(false)}><X size={17}/></button></header>
        {!macResult && <div className="mac-schedule-actions"><button className="primary-button" disabled={macBusy} onClick={()=>void runMac("recommend")}><WandSparkles size={15}/>{macBusy?"Analyzing…":"Analyze & propose schedule"}</button><button className="ghost-button" disabled={macBusy} onClick={()=>void runMac("autonomous")}><Zap size={14}/>{macBusy?"Working…":"Run approved autopilot"}</button></div>}
        {macError && <div className="schedule-inline-error"><AlertTriangle size={15}/><span>{macError}</span></div>}
        {macResult && <div className="mac-result-card">
          <div className="mac-result-status"><CheckCircle2 size={18}/><div><b>{macResult.status === "APPLIED" ? "Schedule applied" : "Schedule proposal ready"}</b><span>{macResult.summary || "MAC completed a scheduling pass."}</span></div></div>
          <div className="mac-result-metrics"><span><b>{macResult.datesProposed ?? 0}</b> date changes</span><span><b>{macResult.dependencyProposals ?? 0}</b> dependencies</span><span><b>{macResult.resourceProposals ?? 0}</b> resource moves</span></div>
          {Array.isArray(macResult.risks) && macResult.risks.length > 0 && <div className="mac-result-risks">{macResult.risks.slice(0,5).map((r:any,i:number)=><div key={i}><AlertTriangle size={12}/><span>{typeof r === "string" ? r : r.title || r.message || JSON.stringify(r)}</span></div>)}</div>}
          {macResult.status !== "APPLIED" && <button className="primary-button" disabled={macBusy} onClick={()=>void applyMac()}><Save size={14}/>{macBusy?"Applying…":"Apply proposed schedule"}</button>}
          {macResult.status === "APPLIED" && <button className="ghost-button" onClick={()=>setMacOpen(false)}>Done — refresh workspace</button>}
        </div>}
      </section>
    </div>}
  </div>;
}

function ScheduleActionDrawer({config,projectId,task,resources,onClose,onSaved}:{config:ApiConfig;projectId:string;task:Task;resources:WorkloadResource[];onClose:()=>void;onSaved:()=>void}){
  const toDateInput=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?"":new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
  const [start,setStart]=useState(toDateInput(task.expectedStart));
  const [end,setEnd]=useState(toDateInput(task.expectedEnd));
  const [resourceId,setResourceId]=useState(task.resourceAssignments?.[0]?.resourceId||"");
  const initialAllocation = task.resourceAssignments?.[0]?.allocationPct ?? 100;
  const [units,setUnits]=useState(String(Math.max(0.1, Math.round(initialAllocation) / 100)));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const selectedResource=resources.find(r=>r.id===resourceId);
  const dayCount=Math.max(1,Math.round((new Date(`${end}T00:00:00`).getTime()-new Date(`${start}T00:00:00`).getTime())/86400000));
  async function save(){
    if(!start||!end)return setError("Choose both a start and finish date.");
    if(new Date(`${end}T00:00:00`) < new Date(`${start}T00:00:00`))return setError("Finish date cannot be before start date.");
    setSaving(true);setError("");
    try{
      await api.updateTask(config,task.id,{expectedStart:new Date(`${start}T00:00:00`).toISOString(),expectedEnd:new Date(`${end}T00:00:00`).toISOString(),isManualSchedule:true});
      if(resourceId){
        await api.assignResource(config,task.id,{resourceId,units:Math.max(0.1,Number(units)||1)});
      }
      onSaved();
    }catch(e){setError(e instanceof ApiError?`${e.status}: ${e.message}`:e instanceof Error?e.message:"Unable to save schedule")}
    finally{setSaving(false)}
  }
  return <div className="schedule-drawer-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose()}}>
    <aside className="schedule-action-drawer">
      <header><div><span className="eyebrow">SCHEDULE WORK</span><h2>{task.name}</h2><p>{task.isCritical?"Critical task · ":""}{task.slackDays ?? "—"}d slack · {task.status}</p></div><button className="icon-button" onClick={onClose}><X size={17}/></button></header>
      <div className="schedule-drawer-body">
        <div className="drawer-section"><span className="eyebrow">WHEN</span><div className="drawer-date-grid"><label><span>Start</span><input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label><span>Finish</span><input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div><div className="drawer-duration"><Clock3 size={13}/> {dayCount} scheduled day{dayCount===1?"":"s"}</div></div>
        <div className="drawer-section"><span className="eyebrow">RESOURCE</span><label><span>Assign capacity</span><select value={resourceId} onChange={e=>setResourceId(e.target.value)}><option value="">No resource — schedule only</option>{resources.map(r=><option key={r.id} value={r.id}>{r.name} · {r.load}% used · {r.capacityHoursPerDay}h/day</option>)}</select></label>{selectedResource&&<div className={`drawer-capacity ${selectedResource.load>100?"hot":""}`}><span>Current load</span><b>{selectedResource.load}%</b><small>{selectedResource.capacityHoursPerDay}h/day · {selectedResource.assignmentCount} assigned</small></div>}{resourceId&&<label><span>Units</span><input type="number" min="0.1" max={selectedResource?.capacityUnits||100} step="0.1" value={units} onChange={e=>setUnits(e.target.value)}/></label>}</div>
        <div className="drawer-section drawer-guidance"><BrainCircuit size={15}/><div><b>Scheduling guidance</b><span>SI will preserve the task's dependency logic. Saving dates makes this task manually placed; downstream schedule recomputation still applies project constraints.</span></div></div>
        {error&&<div className="schedule-inline-error"><AlertTriangle size={14}/><span>{error}</span></div>}
      </div>
      <footer><button className="ghost-button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" onClick={()=>void save()} disabled={saving}><Save size={14}/>{saving?"Saving…":"Save schedule"}</button></footer>
    </aside>
  </div>;
}

function ResourceCard({
  resource,
  selected,
  onSelect,
}: {
  resource: WorkloadResource;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`resource-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="resource-card-top">
        <div className="resource-avatar">
          <ResourceIcon type={resource.type} size={16} />
        </div>
        <div>
          <strong>{resource.name}</strong>
          <span>{resource.externalId ? `ID ${resource.externalId} · ` : ""}{resource.type} · {resource.role || "Resource"}</span>
        </div>
        <ArrowUpRight size={15} />
      </div>
      <div className="capacity-bar">
        <i style={{ width: `${Math.min(100, resource.load)}%` }} />
      </div>
      <div className="resource-card-bottom">
        <span>{resource.capacityHoursPerDay}h/day · {resource.capacityUnits} {resource.unitLabel}</span>
        <b>{resource.load}% signal</b>
      </div>
    </button>
  );
}

function ResourceDetail({
  resource,
  tasks,
  assignedIds,
  config,
  onRefresh,
  onClose,
  onDelete,
  onError,
  intelligence,
}: {
  resource: Resource;
  tasks: Task[];
  assignedIds: string[];
  config: ApiConfig;
  onRefresh: () => void;
  onClose: () => void;
  onDelete: () => void;
  onError: (message: string) => void;
  intelligence?: any;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [assignmentUnits, setAssignmentUnits] = useState("1");
  const [taskQuery, setTaskQuery] = useState("");

  async function toggle(task: Task) {
    setBusy(task.id);
    try {
      if (assignedIds.includes(task.id)) {
        const workload = await api.getResourceWorkload(config, resource.id);
        const assignment = workload.assignments.find((item) => item.taskId === task.id);
        if (assignment) await api.deleteAssignment(config, assignment.assignmentId);
      } else {
        await api.assignResource(config, task.id, { resourceId: resource.id, units: Math.max(0.1, Number(assignmentUnits) || 1) });
      }
      onRefresh();
    } catch (e) {
      const message = e instanceof ApiError
        ? `Assignment: ${e.status} — ${e.message}`
        : e instanceof TypeError
          ? "Assignment: network/CORS error — the Schedule Intelligence API could not be reached."
          : "Assignment failed. Nothing was changed.";
      onError(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="resource-detail">
      <header>
        <div className="resource-avatar large">
          <ResourceIcon type={resource.type} size={20} />
        </div>
        <div>
          <strong>{resource.name}</strong>
          <span>{resource.externalId ? `ID ${resource.externalId} · ` : ""}{resource.type} · {resource.role || "Resource"}</span>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close resource details">
          <X size={16} />
        </button>
      </header>

      <div className="detail-stat">
        <span>Daily capacity</span>
        <strong>{resource.capacityHoursPerDay}h · {resource.capacityUnits} {resource.unitLabel}</strong>
      </div>
      <div className="detail-stat">
        <span>Availability</span>
        <strong>{resource.availabilityPct}%</strong>
      </div>
      <div className="detail-stat">
        <span>Assigned work</span>
        <strong>{assignedIds.length}</strong>
      </div>

      <div className="detail-section">
        <span className="eyebrow">ASSIGN WORK</span>
        <label className="resource-unit-input"><span>Units used per task</span><input type="number" min="0.1" max={resource.capacityUnits} step="0.1" value={assignmentUnits} onChange={e=>setAssignmentUnits(e.target.value)} /></label>
        <div className="resource-task-search">
          <Search size={13} />
          <input
            value={taskQuery}
            onChange={(event) => setTaskQuery(event.target.value)}
            placeholder={`Find among ${tasks.length} work items…`}
            aria-label="Find work item to assign"
          />
        </div>
        <ResourceAssignmentQueue resource={resource} tasks={tasks} assignedIds={assignedIds} taskQuery={taskQuery} busy={busy} intelligence={intelligence} onToggle={toggle} />
      </div>

      <button className="danger-button" onClick={onDelete}>
        <Trash2 size={14} /> Remove resource
      </button>
    </aside>
  );
}


function ResourceAssignmentQueue({resource,tasks,assignedIds,taskQuery,busy,intelligence,onToggle}:{resource:Resource;tasks:Task[];assignedIds:string[];taskQuery:string;busy:string|null;intelligence?:any;onToggle:(task:Task)=>void}){
  const [showAll,setShowAll]=useState(false);
  const q=taskQuery.trim().toLowerCase();
  const assignedSet=new Set(assignedIds);
  const materialIds=new Set((intelligence?.materialTasks||[]).map((x:any)=>x.id));
  const score=(task:Task)=>{
    const text=`${task.name} ${task.description||""}`.toLowerCase();
    const resourceText=`${resource.name} ${resource.role||""} ${resource.type}`.toLowerCase();
    const tokens=resourceText.split(/[^a-z0-9]+/).filter(x=>x.length>2);
    const overlap=tokens.reduce((n,t)=>n+(text.includes(t)?1:0),0);
    return (assignedSet.has(task.id)?-20:0)+(materialIds.has(task.id)?15:0)+(task.isCritical?18:0)+(task.targetFeasible===false?12:0)+overlap*8;
  };
  const matching=tasks.filter(t=>!q||`${t.name} ${t.description||""}`.toLowerCase().includes(q)).sort((a,b)=>score(b)-score(a));
  const visible=showAll||q?matching.slice(0,120):matching.filter(t=>!assignedSet.has(t.id)).slice(0,8);
  const suggestedCount=matching.filter(t=>!assignedSet.has(t.id)).length;
  return <>
    {!showAll&&!q&&<div className="resource-smart-note"><BrainCircuit size={13}/><span>Showing the most relevant {Math.min(8,suggestedCount)} of {suggestedCount} unscheduled work items for this resource.</span></div>}
    <div className="resource-task-list">{visible.map(task=>{const assigned=assignedSet.has(task.id);return <button className="resource-task-toggle" key={task.id} onClick={()=>onToggle(task)} disabled={busy===task.id}><span className={assigned?"assigned-dot":"empty-dot"}/><span>{task.name}</span><b>{assigned?"ASSIGNED":"ADD"}</b></button>})}{!visible.length&&<div className="resource-task-empty">No matching work items.</div>}</div>
    {matching.length>8&&!q&&<button className="resource-browse-button" onClick={()=>setShowAll(v=>!v)}>{showAll?"Show focused suggestions":"Browse all matching work"}<span>{matching.length.toLocaleString()}</span></button>}
  </>;
}

function ResourceIcon({type,size=15}:{type:ResourceType;size?:number}){
  const C=type==="EQUIPMENT"?Cpu:type==="FACILITY"?Building2:type==="VEHICLE"?Car:type==="MATERIAL"?Boxes:type==="TEAM"?UsersRound:UserRound;
  return <C size={size}/>;
}

function OrbitGlyph() {
  return (
    <>
      <span className="glyph-core" />
      <span className="glyph-ring" />
    </>
  );
}
