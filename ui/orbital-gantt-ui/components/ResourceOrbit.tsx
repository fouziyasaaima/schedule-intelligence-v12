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
  X,
} from "lucide-react";
import type { ApiConfig } from "@/lib/api-client";
import { ApiError, api } from "@/lib/api-client";
import type { Resource, Task } from "@/types/gantt";

type Workload = {
  allocatedHoursPerDay: number;
  peakAllocationPct: number;
  assignments: number;
  taskIds: string[];
  assignmentIds: string[];
  windows: Array<{assignmentId:string;taskId:string;taskName:string;start:string;end:string;allocationPct:number}>;
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
}: {
  config: ApiConfig;
  tasks: Task[];
  onClose: () => void;
  onError: (message: string) => void;
  initialResourceId?: string | null;
}) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"orbit" | "timeline" | "impact">("orbit");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Resource | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [saving, setSaving] = useState(false);
  const [workloads, setWorkloads] = useState<Record<string, Workload>>({});
  const [orbitRadius, setOrbitRadius] = useState(150);
  const constellationRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const next = await api.listResources(config);
      setResources(next);
      if (initialResourceId) {
        const focus = next.find((resource) => resource.id === initialResourceId);
        if (focus) setSelected(focus);
      }

      // One project-level aggregation replaces the previous N+1 workload requests.
      // This is important when a project contains many resources.
      const leveling = await api.getProjectResourceLeveling(config, tasks[0]?.projectId || "");
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
          windows: item.assignments.map((assignment, index) => ({ assignmentId: `${resource.id}-${index}`, taskId: assignment.taskId, taskName: assignment.taskName, start: assignment.start, end: assignment.end, allocationPct: assignment.allocationPct })),
        };
        return [resource.id, value] as const;
      });
      setWorkloads(Object.fromEntries(entries));
    } catch (e) {
      const message =
        e instanceof ApiError
          ? `Resources: ${e.status} — ${e.message}`
          : e instanceof TypeError
            ? "Resources: network/CORS error — check API URL and CORS_ORIGINS."
            : "Resources: unable to reach Schedule Intelligence API";
      setError(message);
      onError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Connection changes are the only external inputs that require a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.baseUrl, initialResourceId]);

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
        capacityHoursPerDay: Number(capacity) || 8,
      });
      setName("");
      setRole("");
      setCapacity("8");
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
            <h1>People behind the plan.</h1>
            <p>Capacity, ownership and workload — without turning scheduling into a chat app.</p>
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
          <span>
            <b>{resources.length}</b> people
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
          <div>
            <span className="eyebrow">NEW NODE</span>
            <strong>Add someone to the orbit</strong>
          </div>
          <input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <input placeholder="Role" value={role} onChange={(event) => setRole(event.target.value)} />
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            title="Capacity hours/day"
          />
          <button className="primary-button" disabled={saving} onClick={() => void add()}>
            {saving ? <span className="spinner" /> : <Plus size={14} />} Add
          </button>
          <button className="icon-button" onClick={() => setCreating(false)} aria-label="Cancel">
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
                    <UserRound size={15} />
                  </span>
                  <b>{resource.name}</b>
                  <small>{resource.role || "Resource"}</small>
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
            />
          )}
        </div>
      ) : mode === "timeline" ? (
        <div className="resource-timeline">
          {workload.map((resource) => {
            const windows=workloads[resource.id]?.windows||[];
            const projectStart=Math.min(...tasks.map(t=>new Date(t.expectedStart).getTime()),Date.now());
            const projectEnd=Math.max(...tasks.map(t=>new Date(t.expectedEnd).getTime()),projectStart+86400000);
            const span=Math.max(1,projectEnd-projectStart);
            return <button key={resource.id} className="timeline-resource" onClick={() => setSelected(resource)}>
              <div className="timeline-person"><span className="resource-avatar"><UserRound size={14}/></span><span><b>{resource.name}</b><small>{resource.role || "Resource"}</small></span></div>
              <div className="timeline-track"><span className="capacity-line"/>{windows.map(w=>{const left=Math.max(0,Math.min(100,(new Date(w.start).getTime()-projectStart)/span*100));const width=Math.max(2,Math.min(100-left,(new Date(w.end).getTime()-new Date(w.start).getTime())/span*100));return <i key={w.assignmentId} title={`${w.taskName} · ${w.allocationPct}%`} style={{left:`${left}%`,width:`${width}%`}}/>})}</div>
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
                  <small>{resource.role || "Resource"}</small>
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
    </div>
  );
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
          <UserRound size={16} />
        </div>
        <div>
          <strong>{resource.name}</strong>
          <span>{resource.role || "Resource"}</span>
        </div>
        <ArrowUpRight size={15} />
      </div>
      <div className="capacity-bar">
        <i style={{ width: `${Math.min(100, resource.load)}%` }} />
      </div>
      <div className="resource-card-bottom">
        <span>{resource.capacityHoursPerDay}h capacity</span>
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
}: {
  resource: Resource;
  tasks: Task[];
  assignedIds: string[];
  config: ApiConfig;
  onRefresh: () => void;
  onClose: () => void;
  onDelete: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(task: Task) {
    setBusy(task.id);
    try {
      if (assignedIds.includes(task.id)) {
        const workload = await api.getResourceWorkload(config, resource.id);
        const assignment = workload.assignments.find((item) => item.taskId === task.id);
        if (assignment) await api.deleteAssignment(config, assignment.assignmentId);
      } else {
        await api.assignResource(config, task.id, { resourceId: resource.id, allocationPct: 100 });
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
          <UserRound size={20} />
        </div>
        <div>
          <strong>{resource.name}</strong>
          <span>{resource.role || "Resource"}</span>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close resource details">
          <X size={16} />
        </button>
      </header>

      <div className="detail-stat">
        <span>Daily capacity</span>
        <strong>{resource.capacityHoursPerDay}h</strong>
      </div>
      <div className="detail-stat">
        <span>Assigned work</span>
        <strong>{assignedIds.length}</strong>
      </div>

      <div className="detail-section">
        <span className="eyebrow">ASSIGN WORK</span>
        {tasks.slice(0, 8).map((task) => {
          const assigned = assignedIds.includes(task.id);
          return (
            <button
              className="resource-task-toggle"
              key={task.id}
              onClick={() => void toggle(task)}
              disabled={busy === task.id}
            >
              <span className={assigned ? "assigned-dot" : "empty-dot"} />
              <span>{task.name}</span>
              <b>{assigned ? "ASSIGNED" : "ADD"}</b>
            </button>
          );
        })}
      </div>

      <button className="danger-button" onClick={onDelete}>
        <Trash2 size={14} /> Remove resource
      </button>
    </aside>
  );
}

function OrbitGlyph() {
  return (
    <>
      <span className="glyph-core" />
      <span className="glyph-ring" />
    </>
  );
}
