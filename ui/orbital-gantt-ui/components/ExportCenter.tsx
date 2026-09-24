"use client";
import { useMemo, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer, Braces, Table2, Sparkles } from "lucide-react";
import * as XLSX from "xlsx";
import type { Project, Task, Dependency } from "@/types/gantt";
import type { ApiConfig } from "@/lib/api-client";
import { PrmsExportWizard } from "./PrmsExportWizard";

type Props = { project: Project; tasks: Task[]; dependencies: Dependency[]; config: ApiConfig };

function exchangeId(t: Task) { return t.externalId || t.displayId || `SI-${String(t.id).slice(-8).toUpperCase()}`; }

type Row = Record<string, string | number | boolean | null>;

function date(v: string | null | undefined) { return v ? new Date(v).toLocaleDateString() : ""; }
function iso(v: string | null | undefined) { return v ? new Date(v).toISOString() : ""; }
function esc(v: unknown) { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
function baseRows(project: Project, tasks: Task[], dependencies: Dependency[]): Row[] {
  const depMap = new Map<string, string[]>();
  for (const d of dependencies) if (d.isActive) depMap.set(d.successorId, [...(depMap.get(d.successorId) || []), d.predecessorId]);
  return tasks.map(t => ({
    ID: exchangeId(t),
    InternalID: t.id,
    Task: t.name,
    Type: t.taskType,
    ParentID: t.parentId ? (tasks.find(p=>p.id===t.parentId) ? exchangeId(tasks.find(p=>p.id===t.parentId)!) : t.parentId) : "",
    Start: date(t.expectedStart),
    End: date(t.expectedEnd),
    DurationDays: t.durationDays,
    ActualStart: date(t.actualStart),
    ActualEnd: date(t.actualEnd),
    Status: t.status,
    ProgressPct: t.progressPct,
    Critical: !!t.isCritical,
    SlackDays: t.slackDays ?? "",
    Resource: (t.resourceAssignments || []).map(a => a.resourceName || a.resourceId).join(", "),
    ResourceIDs: (t.resourceAssignments || []).map(a => a.resourceId).join(", "),
    Dependencies: (depMap.get(t.id) || []).join(", "),
    Source: t.source || "SI",
    Project: project.name,
  }));
}

function resources(tasks: Task[]): Row[] {
  const map = new Map<string, Row>();
  for (const t of tasks) for (const a of t.resourceAssignments || []) {
    const key = a.resourceId;
    const current = map.get(key);
    map.set(key, {
      ResourceID: a.resourceId,
      ResourceName: a.resourceName || a.resourceId,
      Role: a.role || "",
      AssignedTasks: current ? `${current.AssignedTasks}, ${t.displayId || t.externalId || t.id}` : (t.displayId || t.externalId || t.id),
      AllocationPct: current ? Number(current.AllocationPct) + a.allocationPct : a.allocationPct,
    });
  }
  return [...map.values()];
}

function downloadStandardTemplate() {
  const wb = XLSX.utils.book_new();
  const add=(rows:any[][],name:string)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
  add([["SISF","1.0"],["Purpose","Universal schedule interchange; PRMS is not required."],["Hierarchy","Use Parent Task ID, not database IDs."],["Round trip","Keep Task ID / Resource ID stable when editing."],["Publish","Choose PRMS only when exporting/publishing from SI."]],"Instructions");
  add([["Project ID","Project Name","Description","Start Date","Finish Date","Calendar","Status","Owner"]],"Project");
  add([["Task ID","Parent Task ID","WBS Code","Task Name","Description","Task Type","Start","Finish","Duration","Duration Unit","Calendar","Status","Priority","Percent Complete","Constraint Type","Constraint Date","Owner","Notes"]],"Tasks");
  add([["Dependency ID","Predecessor Task ID","Successor Task ID","Type","Lag","Lag Unit"]],"Dependencies");
  add([["Resource ID","Resource Name","Resource Type","Capacity","Capacity Unit","Calendar","Cost Rate","Availability %","Status","Notes"]],"Resources");
  add([["Assignment ID","Task ID","Resource ID","Assignment Type","Units","Allocation %","Planned Start","Planned Finish","Role"]],"Assignments");
  add([["Calendar ID","Calendar Name","Type"]],"Calendars"); add([["Calendar ID","Date","Type","Hours"]],"Calendar Exceptions"); add([["Task ID","Field Name","Data Type","Value"]],"Custom Fields"); add([["Format","SISF"],["Version","1.0"],["Generator","Schedule Intelligence"]],"SISF_Metadata");
  XLSX.writeFile(wb,"SI-Standard-Schedule-v1.0.xlsx");
}

export function ExportCenter({ project, tasks, dependencies, config }: Props) {
  const [open, setOpen] = useState(false);
  const [prmsOpen, setPrmsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = useMemo(() => baseRows(project, tasks, dependencies), [project, tasks, dependencies]);

  function exportCsv() {
    const headers = Object.keys(rows[0] || { ID: "", Task: "" });
    const csv = [headers.map(esc).join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\r\n");
    downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `schedule-intelligence-${project.id}.csv`);
  }

  async function exportExcel() {
    setBusy("excel");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const taskMap = new Map(tasks.map(t => [t.id, exchangeId(t)]));
      const projectSheet = [{ "Project ID": project.id, "Project Name": project.name, "Description": project.description || "", "Start Date": project.startDate, "Finish Date": tasks.length ? tasks.reduce((m,t)=>t.expectedEnd>m?t.expectedEnd:m, tasks[0].expectedEnd) : "", "Calendar": "", "Status": project.status, "Owner": "" }];
      const taskSheet = tasks.map(t => ({
        "Task ID": exchangeId(t), "Parent Task ID": t.parentId ? (taskMap.get(t.parentId) || "") : "", "WBS Code": "", "Task Name": t.name, "Description": t.description || "",
        "Task Type": t.taskType, "Start": iso(t.expectedStart), "Finish": iso(t.expectedEnd), "Duration": t.durationDays, "Duration Unit": "Days", "Calendar": "",
        "Status": t.status, "Priority": "", "Percent Complete": t.progressPct, "Constraint Type": "", "Constraint Date": "",
        "Owner": (t.resourceAssignments||[]).find(a=>a.role?.toLowerCase().includes("responsible"))?.resourceName || "", "Notes": ""
      }));
      const resourceMap = new Map<string, any>();
      for (const t of tasks) for (const a of t.resourceAssignments || []) if (!resourceMap.has(a.resourceId)) resourceMap.set(a.resourceId, { "Resource ID": a.resourceId, "Resource Name": a.resourceName || a.resourceId, "Resource Type": "", "Capacity": "", "Capacity Unit": "", "Calendar": "", "Cost Rate": "", "Availability %": "", "Status": "", "Notes": "" });
      const resourceSheet = [...resourceMap.values()];
      const assignments = tasks.flatMap(t => (t.resourceAssignments||[]).map((a,i)=>({ "Assignment ID": `A-${exchangeId(t)}-${i+1}`, "Task ID": exchangeId(t), "Resource ID": a.resourceId, "Assignment Type": a.role || "Required", "Units": 1, "Allocation %": a.allocationPct, "Planned Start": t.expectedStart, "Planned Finish": t.expectedEnd, "Role": a.role || "" })));
      const depSheet = dependencies.filter(d=>d.isActive).map((d,i)=>({ "Dependency ID": d.id || `D-${i+1}`, "Predecessor Task ID": taskMap.get(d.predecessorId) || d.predecessorId, "Successor Task ID": taskMap.get(d.successorId) || d.successorId, "Type": d.dependencyType.replaceAll("_","-"), "Lag": d.lagDays, "Lag Unit": "Days" }));
      const summary = [["Format","SISF"],["Version","1.0"],["Generator","Schedule Intelligence"],["Template","Universal Schedule"],["Exported At",new Date().toISOString()],["Tasks",tasks.length],["Resources",resourceSheet.length],["Assignments",assignments.length],["Dependencies",depSheet.length]];
      const custom = tasks.flatMap(t => Object.entries((t as any).customFields || {}).map(([k,v])=>({"Task ID":exchangeId(t),"Field Name":k,"Data Type":typeof v,"Value":String(v ?? "")})));
      const append=(data:any[],name:string)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),name);
      append(projectSheet,"Project"); append(taskSheet,"Tasks"); append(depSheet,"Dependencies"); append(resourceSheet,"Resources"); append(assignments,"Assignments"); append([],"Calendars"); append([],"Calendar Exceptions"); append(custom,"Custom Fields"); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),"SISF_Metadata");
      for(const ws of wb.SheetNames.map(n=>wb.Sheets[n])){const range=XLSX.utils.decode_range(ws["!ref"]||"A1:A1");ws["!cols"]=Array.from({length:range.e.c+1},(_,i)=>({wch:Math.min(38,Math.max(14,i===0?20:16))}))}
      XLSX.writeFile(wb,`SI-SISF-${project.id}-v1.0.xlsx`);
    } finally { setBusy(null); setOpen(false); }
  }

  async function exportPdf() {
    setBusy("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const margin = 32; const pageW = doc.internal.pageSize.getWidth();
      doc.setFontSize(18); doc.text("SCHEDULE INTELLIGENCE", margin, 34);
      doc.setFontSize(11); doc.text(project.name, margin, 52);
      doc.setFontSize(8); doc.text(`Project ${project.id} · ${tasks.length} tasks · ${dependencies.filter(d => d.isActive).length} dependencies · Exported ${new Date().toLocaleString()}`, margin, 68);
      let y = 88;
      const cols = ["ID", "Task", "Parent", "Start", "End", "Days", "Status", "Resource"];
      const widths = [58, 170, 58, 68, 68, 42, 62, 120];
      const drawHeader = () => { doc.setFontSize(7); let x = margin; for (let i=0;i<cols.length;i++){doc.text(cols[i],x,y);x+=widths[i];} y += 12; };
      drawHeader();
      doc.setFontSize(7);
      for (const r of rows) {
        if (y > 555) { doc.addPage(); y = 38; doc.setFontSize(12); doc.text("SCHEDULE INTELLIGENCE · CONTINUED", margin, y); y += 18; drawHeader(); }
        let x = margin; const vals = [String(r.ID), String(r.Task), String(r.ParentID), String(r.Start), String(r.End), String(r.DurationDays), String(r.Status), String(r.Resource)];
        for (let i=0;i<vals.length;i++){const text = vals[i].length > (i===1?30:18) ? `${vals[i].slice(0,i===1?27:15)}…` : vals[i]; doc.text(text,x,y);x+=widths[i];}
        y += 11;
      }
      doc.addPage(); y = 36; doc.setFontSize(13); doc.text("GANTT TIMELINE · PROJECT OVERVIEW", margin, y); y += 22;
      const valid = tasks.map(t => ({t,s:new Date(t.expectedStart).getTime(),e:new Date(t.expectedEnd).getTime()})).filter(x=>Number.isFinite(x.s)&&Number.isFinite(x.e));
      const min = Math.min(...valid.map(x=>x.s)); const max = Math.max(...valid.map(x=>x.e)); const span = Math.max(1,max-min); const chartW = pageW - margin*2; const rowH = 15; const barX = margin + 155;
      doc.setFontSize(7); doc.text(new Date(min).toLocaleDateString(), barX, y); doc.text(new Date(max).toLocaleDateString(), margin+chartW-55, y); y += 12;
      for (const x of valid.slice(0, 34)) {
        if (y > 560) { doc.addPage(); y = 36; }
        const id = x.t.displayId || x.t.externalId || x.t.id; doc.text(`${id} ${x.t.name}`.slice(0,28), margin, y+8);
        const left = barX + ((x.s-min)/span)*(chartW-(barX-margin)); const right = barX + ((x.e-min)/span)*(chartW-(barX-margin));
        doc.setDrawColor(120); doc.rect(left, y, Math.max(2,right-left), 8, "F"); y += rowH;
      }
      doc.setFontSize(7); doc.text("Actual dates remain source-owned; expected/planned dates are exported from the SI schedule state.", margin, 585);
      doc.save(`schedule-intelligence-${project.id}.pdf`);
    } finally { setBusy(null); setOpen(false); }
  }

  function exportJson() {
    const payload = { format: "schedule-intelligence.v1", exportedAt: new Date().toISOString(), project, tasks, dependencies: dependencies.filter(d => d.isActive) };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `schedule-intelligence-${project.id}.json`); setOpen(false);
  }

  function printReport() {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Schedule Intelligence · ${esc(project.name)}</title><style>@page{size:landscape;margin:12mm}body{font-family:Arial,sans-serif;padding:12px;color:#111}h1{margin:0 0 4px;font-size:20px}small{color:#666}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #ccc;padding:6px;font-size:10px;text-align:left}th{background:#eee}tr{break-inside:avoid}</style></head><body><h1>Schedule Intelligence</h1><b>${esc(project.name)}</b><br/><small>Project ${esc(project.id)} · ${tasks.length} tasks · ${new Date().toLocaleString()}</small><table><thead><tr><th>ID</th><th>Task</th><th>Parent</th><th>Start</th><th>End</th><th>Status</th><th>Resource</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.ID)}</td><td>${esc(r.Task)}</td><td>${esc(r.ParentID)}</td><td>${esc(r.Start)}</td><td>${esc(r.End)}</td><td>${esc(r.Status)}</td><td>${esc(r.Resource)}</td></tr>`).join("")}</tbody></table></body></html>`;
    const iframe=document.createElement("iframe");
    iframe.setAttribute("title","Schedule Intelligence print preview");
    iframe.style.position="fixed";iframe.style.right="0";iframe.style.bottom="0";iframe.style.width="1px";iframe.style.height="1px";iframe.style.border="0";iframe.style.opacity="0";
    document.body.appendChild(iframe);
    const doc=iframe.contentDocument;
    if(!doc){iframe.remove();alert("Print preview could not be prepared. Please try again.");return;}
    doc.open();doc.write(html);doc.close();
    const print=()=>{try{iframe.contentWindow?.focus();iframe.contentWindow?.print();}finally{window.setTimeout(()=>iframe.remove(),1500);}};
    if(doc.readyState==="complete") window.setTimeout(print,100); else iframe.onload=()=>window.setTimeout(print,100);
    setOpen(false);
  }

  return <div className="export-center" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}}>
    <button className="top-command export-trigger" onClick={()=>setOpen(v=>!v)} aria-expanded={open} title="Export schedule"><Download size={14}/><span className="theme-action-label">Export</span><ChevronDown size={11}/></button>
    {open&&<div className="export-menu">
      <div className="export-menu-head"><div><b>Export schedule</b><small>{project.name} · {tasks.length} tasks</small></div></div>
      <button onClick={exportCsv}><Table2 size={15}/><span><b>CSV</b><small>Flat schedule data</small></span></button>
      <button onClick={()=>void exportExcel()} disabled={!!busy}><FileSpreadsheet size={15}/><span><b>Excel (.xlsx)</b><small>Schedule · resources · dependencies</small></span>{busy==="excel"&&<i>…</i>}</button>
      <button onClick={downloadStandardTemplate}><FileSpreadsheet size={15}/><span><b>SI Standard Template</b><small>Universal SISF v1.0 blank workbook</small></span></button>
      <button onClick={()=>void exportPdf()} disabled={!!busy}><FileText size={15}/><span><b>PDF + Gantt</b><small>Printable schedule and timeline</small></span>{busy==="pdf"&&<i>…</i>}</button>
      <button onClick={exportJson}><Braces size={15}/><span><b>JSON</b><small>Portable schedule snapshot</small></span></button>
      <button onClick={printReport}><Printer size={15}/><span><b>Print report</b><small>Browser print / save as PDF</small></span></button>
      <div className="export-menu-divider"><span>PUBLISH</span></div>
      <button className="export-prms-action" onClick={()=>{setOpen(false);setPrmsOpen(true)}}><Sparkles size={15}/><span><b>Export to PRMS</b><small>Create a fresh PRMS project, map the data and establish the connection</small></span></button>
      <div className="export-menu-note">Source credentials and connector secrets are never included. PRMS publishing requires explicit confirmation.</div>
    </div>}
    {prmsOpen&&<PrmsExportWizard config={config} project={project} tasks={tasks} dependencies={dependencies} onClose={()=>setPrmsOpen(false)}/>}
  </div>;
}
