"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CheckCircle2, CircleAlert, Link2, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { ApiError, connectorApi, type ApiConfig, type Connector } from "@/lib/api-client";
import { notify } from "@/lib/notifications";
import type { Project, Task, Dependency } from "@/types/gantt";

type Props = {
  config: ApiConfig;
  project: Project;
  tasks: Task[];
  dependencies: Dependency[];
  onClose: () => void;
  onPublished?: () => void;
};

type Mapping = { source: string; target: string; description: string; enabled: boolean };

const DEFAULT_MAPPINGS: Mapping[] = [
  { source: "Project Name", target: "E_Name", description: "New PRMS root event name", enabled: true },
  { source: "Task Name", target: "E_Name", description: "PRMS event name", enabled: true },
  { source: "Description", target: "E_Description", description: "Task description", enabled: true },
  { source: "Description / SOW", target: "E_SOW", description: "Statement of work / description", enabled: true },
  { source: "Parent Task", target: "E_ID_Dependance", description: "PRMS hierarchy parent", enabled: true },
  { source: "Expected Start", target: "E_StartExpectedDay", description: "Expected start date", enabled: true },
  { source: "Expected Finish", target: "E_EndExpectedDay", description: "Expected finish date", enabled: true },
  { source: "Owner / Person Resource", target: "E_Leader", description: "Resolved PRMS member ID", enabled: true },
  { source: "Task Type", target: "E_Type", description: "TASK / SUMMARY / MILESTONE", enabled: true },
  { source: "Status", target: "Status", description: "SI task status", enabled: true },
  { source: "Sort Order", target: "E_Sequence", description: "Stable schedule sequence", enabled: true },
];

export function PrmsExportWizard({ config, project, tasks, dependencies, onClose, onPublished }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [status, setStatus] = useState<{ configured: boolean; baseUrl: string; tokenUrl: string; missing: string[] } | null>(null);
  const [checking, setChecking] = useState(true);
  const [connector, setConnector] = useState<Connector | null>(null);
  const [existing, setExisting] = useState<Connector | null>(null);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [allowUnassigned, setAllowUnassigned] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [mappings, setMappings] = useState<Mapping[]>(DEFAULT_MAPPINGS);
  const [done, setDone] = useState<any>(null);
  const [error, setError] = useState("");
  const [destinationProjectId, setDestinationProjectId] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setChecking(true);
      try {
        const [s, all] = await Promise.all([connectorApi.prmsStatus(config), connectorApi.list(config)]);
        if (!active) return;
        setStatus(s);
        const linked = all.find(c => c.provider === "prms" && String(c.config?.targetProjectId || "") === project.id) || null;
        setExisting(linked);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Unable to check PRMS configuration.");
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
  }, [config, project.id]);

  const unresolved = preview?.unresolvedLeaders || [];
  const users = preview?.users || [];
  const rows = preview?.rows || [];
  const enabledMappings = useMemo(() => mappings.filter(m => m.enabled), [mappings]);
  const taskCount = tasks.length;
  const resourceCount = new Set(tasks.flatMap(t => (t.resourceAssignments || []).map(a => a.resourceId))).size;
  const dependencyCount = dependencies.filter(d => d.isActive).length;

  async function ensureBootstrapConnector() {
    if (connector) return connector;
    if (existing) {
      setConnector(existing);
      return existing;
    }
    setCreating(true);
    setError("");
    try {
      const c = await connectorApi.create(config, {
        name: `PRMS · ${project.name}`,
        provider: "prms",
        baseUrl: status?.baseUrl || "https://prmscloud.com",
        authType: "NONE",
        direction: "EXPORT",
        config: {
          targetProjectId: project.id,
          prms: { bootstrap: true },
          sync: { entities: ["task"], conflict: "external_wins", intervalMinutes: 60 },
          operations: {},
          response: { itemsPath: "", idField: "id" },
        },
      });
      setConnector(c);
      return c;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to create the PRMS export connection.");
      throw e;
    } finally {
      setCreating(false);
    }
  }

  async function continueFromStep1() {
    if (!status?.configured) return;
    try {
      await ensureBootstrapConnector();
      setStep(2);
    } catch { /* error is rendered */ }
  }

  async function preparePreview() {
    const c = await ensureBootstrapConnector();
    setPreviewing(true);
    setError("");
    try {
      const r = await connectorApi.prmsPublishPreview(config, c.id, { projectId: project.id, destinationProjectId, leaderOverrides: overrides });
      setPreview(r);
      setStep(3);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to prepare the PRMS export preview.");
    } finally {
      setPreviewing(false);
    }
  }

  async function publish() {
    const c = await ensureBootstrapConnector();
    if (!preview) return;
    setPublishing(true);
    setError("");
    try {
      const r = await connectorApi.prmsPublish(config, c.id, {
        projectId: project.id,
        destinationProjectId,
        leaderOverrides: overrides,
        allowUnassigned,
        fieldMapping: enabledMappings,
      });

      const finalConfig = {
        ...(c.config || {}),
        targetProjectId: project.id,
        prms: { ...(c.config?.prms || {}), projectId: String(r.prmsProjectId), parentProjectId: String(r.destinationProjectId || destinationProjectId), bootstrap: undefined },
        fieldMapping: enabledMappings,
        source: { type: "SISF", projectId: project.id, projectName: project.name },
      };
      const updated = await connectorApi.update(config, c.id, { config: finalConfig });

      // Also expose the mapping in the normal Connector Studio mapping surface.
      for (const mapping of enabledMappings) {
        try {
          const already = (updated.mappings || []).find(m => m.entityType === "task" && m.externalField === mapping.target && m.internalField === mapping.source);
          if (!already) {
            await connectorApi.addMapping(config, c.id, {
              entityType: "task",
              externalField: mapping.target,
              internalField: mapping.source,
              direction: "EXPORT",
              transform: {},
              required: ["Task Name", "Parent Task", "Expected Start", "Expected Finish"].includes(mapping.source),
            });
          }
        } catch { /* mapping presentation must not invalidate an already successful PRMS publish */ }
      }

      setDone({ ...r, connectorId: updated.id });
      setStep(4);
      notify({ kind: "success", title: "Exported to PRMS", message: `${project.name} was created in PRMS with root E_ID ${r.prmsProjectId}. The PRMS connection is now available in Connectors.` });
      onPublished?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "PRMS export failed.");
    } finally {
      setPublishing(false);
    }
  }

  async function closeWizard() {
    if (connector && !done && !existing) {
      try { await connectorApi.remove(config, connector.id); } catch { /* keep close action deterministic */ }
    }
    onClose();
  }

  return (
    <div className="prms-export-backdrop" onMouseDown={e => { if (e.currentTarget === e.target) void closeWizard(); }}>
      <section className="prms-export-wizard" role="dialog" aria-modal="true" aria-label="Export to PRMS">
        <header className="prms-export-head">
          <div className="prms-export-brand"><span className="prms-export-icon"><Sparkles size={18} /></span><div><span className="studio-kicker">UNIVERSAL DATA EXCHANGE · PRMS</span><h2>Export this schedule to PRMS</h2><p>Map the SI schedule, review the exact PRMS hierarchy, then create a fresh PRMS root. The connection is established automatically after confirmation.</p></div></div>
          <button className="icon-button" onClick={() => void closeWizard()} aria-label="Close"><X size={17} /></button>
        </header>

        <div className="prms-export-steps">
          {[[1, "PRMS connection"], [2, "Data mapping"], [3, "Review & confirm"], [4, "Connected"]].map(([n, label]) => <div key={n} className={`prms-export-step ${step >= Number(n) ? "active" : ""} ${step === Number(n) ? "current" : ""}`}><span>{step > Number(n) ? <Check size={12} /> : n}</span><b>{label}</b></div>)}
        </div>

        {error && <div className="connector-error-detail prms-export-error"><CircleAlert size={15} /><span>{error}</span></div>}

        {step === 1 && <div className="prms-export-body">
          <div className="prms-export-summary"><div><span className="studio-kicker">SOURCE</span><strong>{project.name}</strong><small>{taskCount} tasks · {resourceCount} resources · {dependencyCount} dependencies</small></div><ArrowRight size={18} /><div><span className="studio-kicker">DESTINATION</span><strong>New PRMS project</strong><small>The PRMS root will be created only after you confirm.</small></div></div>
          {!existing && <div className="prms-destination-card"><div><span className="studio-kicker">PRMS DESTINATION</span><h3>Where should this new project be created?</h3><p>Enter the existing PRMS <b>ProjectId / parent E_ID</b>. Schedule Intelligence will create a new root project under it. The newly returned root ID will become the SI PRMS connection root.</p></div><label><span>PRMS Project ID</span><input inputMode="numeric" pattern="[0-9]*" value={destinationProjectId} onChange={e=>setDestinationProjectId(e.target.value.replace(/\D/g,""))} placeholder="e.g. 7707"/><small>Example: 7707 → new PRMS root 8927 → SI connects to 8927</small></label></div>}
          <div className="prms-export-security"><ShieldCheck size={18} /><div><b>PRMS authentication is platform-managed</b><span>The server-side PRMS token exchange remains protected. This wizard does not expose PRMS credentials in the browser.</span>{status && <small>{status.configured ? `PRMS endpoint ready: ${status.baseUrl}` : `Missing API configuration: ${status.missing.join(", ")}`}</small>}</div></div>
          {existing && <div className="prms-existing-connection"><CheckCircle2 size={16} /><div><b>This SI project already has a PRMS connection.</b><span>{existing.name} · {existing.config?.prms?.projectId ? `Root E_ID ${existing.config.prms.projectId}` : "Root not yet linked"}</span></div></div>}
          <div className="prms-export-actions"><button className="ghost-button" onClick={() => void closeWizard()}>{existing ? "Close" : "Cancel"}</button>{existing ? <button className="primary-button" onClick={() => void closeWizard()}>PRMS is already connected <CheckCircle2 size={14} /></button> : <button className="primary-button" disabled={checking || creating || !status?.configured || !/^\d+$/.test(destinationProjectId)} onClick={() => void continueFromStep1()}>{creating ? "Preparing connection…" : "Continue to data mapping"}<ArrowRight size={14} /></button>}</div>
        </div>}

        {step === 2 && <div className="prms-export-body">
          <div className="prms-export-section-head"><div><span className="studio-kicker">STEP 2 · MAPPING CONTRACT</span><h3>Confirm what SI will write into PRMS</h3><p>This is the canonical SI → PRMS contract. External PRMS IDs are generated by PRMS; hierarchy is created from the SI parent relationship.</p></div><span className="prms-mapping-count">{enabledMappings.length} active mappings</span></div>
          <div className="prms-map-table"><div className="prms-map-head"><span>SI source</span><span></span><span>PRMS field</span><span>Meaning</span><span>Use</span></div>{mappings.map((m, i) => <div className="prms-map-row" key={`${m.source}-${i}`}><span><b>{m.source}</b></span><ArrowRight size={13} /><code>{m.target}</code><small>{m.description}</small><label><input type="checkbox" checked={m.enabled} onChange={e => setMappings(xs => xs.map((x, j) => j === i ? { ...x, enabled: e.target.checked } : x))} /><span>{m.enabled ? "ON" : "OFF"}</span></label></div>)}</div>
          <div className="prms-export-note"><Check size={13} /> First creation copies SI Expected dates into the new PRMS event dates. Actual dates remain source-owned after the integration is established.</div>
          <div className="prms-export-actions"><button className="ghost-button" onClick={() => setStep(1)}>Back</button><button className="primary-button" disabled={enabledMappings.length === 0 || previewing} onClick={() => void preparePreview()}>{previewing ? "Preparing preview…" : "Review PRMS hierarchy"}<ArrowRight size={14} /></button></div>
        </div>}

        {step === 3 && preview && <div className="prms-export-body">
          <div className="prms-export-section-head"><div><span className="studio-kicker">STEP 3 · REVIEW & CONFIRM</span><h3>Nothing is written until you confirm</h3><p>Review the members, hierarchy and volume that will be created in PRMS.</p><div className="prms-destination-pill">Parent ProjectId <b>{destinationProjectId}</b> · new root will be returned after creation</div></div></div>
          <div className="prms-publish-stats"><span><b>{preview.taskCount}</b> events to create</span><span><b>{unresolved.length}</b> leader mappings need attention</span><span><b>{users.length}</b> PRMS members available</span><span><b>{dependencyCount}</b> SI dependencies remain SI-owned</span></div>
          {unresolved.length > 0 && <div className="prms-resolution"><div className="studio-section-title"><div><span className="studio-kicker">MEMBER RESOLUTION</span><h3>Resolve PRMS E_Leader</h3><p>SI resolves person resources by stable PRMS member identity or exact name. No AI-generated member IDs are used.</p></div></div>{unresolved.map((u: any) => <div className="prms-resolution-row" key={u.taskId}><div><strong>{u.taskName}</strong><small>{u.resourceName} · {u.reason}</small></div><select value={overrides[u.taskId] || ""} onChange={e => setOverrides(x => ({ ...x, [u.taskId]: Number(e.target.value) || 0 }))}><option value="">Select PRMS member…</option>{users.map((m: any) => <option key={m.id} value={m.id}>{m.name} · {m.id}{m.designation ? ` · ${m.designation}` : ""}</option>)}</select></div>)}<label className="prms-unassigned"><input type="checkbox" checked={allowUnassigned} onChange={e => setAllowUnassigned(e.target.checked)} /> Allow unresolved people with <code>E_Leader = 0</code></label><button className="ghost-button" onClick={() => void preparePreview()} disabled={previewing}><RefreshCw size={13} /> Recheck mappings</button></div>}
          <div className="prms-review-table"><div className="prms-review-head"><span>SI task</span><span>Expected</span><span>PRMS leader</span><span>Parent</span></div>{rows.slice(0, 160).map((r: any) => <div className="prms-review-row" key={r.taskId}><strong>{r.name}</strong><span>{String(r.expectedStart).slice(0, 10)} → {String(r.expectedEnd).slice(0, 10)}</span><span>{r.leaderName || r.resourceName || "Unassigned"}{r.leaderId ? ` · ${r.leaderId}` : ""}</span><span>{r.parentId ? "Child" : "Root task"}</span></div>)}{rows.length > 160 && <div className="prms-review-row"><span>Showing first 160 items for review. All {rows.length} items are included in the publish operation.</span></div>}</div>
          <div className="prms-export-actions"><button className="ghost-button" onClick={() => setStep(2)}>Back to mapping</button><button className="primary-button" disabled={publishing || (!allowUnassigned && unresolved.length > 0)} onClick={() => void publish()}><Sparkles size={14} />{publishing ? "Creating PRMS project…" : "Confirm & export to PRMS"}</button></div>
        </div>}

        {step === 4 && done && <div className="prms-export-success"><div className="success-orb"><CheckCircle2 size={28} /></div><span className="studio-kicker">PRMS CONNECTION ESTABLISHED</span><h3>{project.name} is now connected to PRMS</h3><p>The fresh PRMS project was created and its root ID is now stored against this SI project.</p><div className="prms-success-facts"><div><span>Destination ProjectId</span><b>{done.destinationProjectId || destinationProjectId}</b></div><div><span>New PRMS root E_ID</span><b>{done.prmsProjectId}</b></div><div><span>Events created</span><b>{done.taskCount}</b></div><div><span>Connector root</span><b>{done.prmsProjectId}</b></div><div><span>Connection</span><b>PRMS · {project.name}</b></div></div><div className="prms-success-flow"><span>SI Project</span><ArrowRight size={14} /><span>PRMS Connector</span><ArrowRight size={14} /><strong>Root E_ID {done.prmsProjectId}</strong></div><div className="prms-export-actions"><button className="ghost-button" onClick={() => void closeWizard()}>Close</button><button className="primary-button" onClick={() => void closeWizard()}>Done</button></div></div>}
      </section>
    </div>
  );
}
