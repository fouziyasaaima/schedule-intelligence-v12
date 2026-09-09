import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { requireApiKey, requireScope } from "../plugins/auth";
import { computeSchedule } from "../scheduling/cpm";

const DAY = 86_400_000;

type Change = { taskId: string; expectedStart?: string; expectedEnd?: string; durationDays?: number };

function orderTasks(tasks: any[], deps: any[]) {
  const by = new Map(tasks.map(t => [t.id, t]));
  const indeg = new Map(tasks.map(t => [t.id, 0]));
  const next = new Map<string, string[]>();
  for (const d of deps) {
    if (!by.has(d.predecessorId) || !by.has(d.successorId)) continue;
    indeg.set(d.successorId, (indeg.get(d.successorId) || 0) + 1);
    next.set(d.predecessorId, [...(next.get(d.predecessorId) || []), d.successorId]);
  }
  const q = tasks.filter(t => (indeg.get(t.id) || 0) === 0).map(t => t.id);
  const out: string[] = [];
  while (q.length) {
    const id = q.shift()!; out.push(id);
    for (const n of next.get(id) || []) { const v = (indeg.get(n) || 0) - 1; indeg.set(n, v); if (v === 0) q.push(n); }
  }
  for (const t of tasks) if (!out.includes(t.id)) out.push(t.id);
  return out;
}

function finishMap(tasks: any[], deps: any[]) {
  const by = new Map(tasks.map(t => [t.id, t]));
  const order = orderTasks(tasks, deps);
  const out = new Map<string, { start: number; finish: number }>();
  let projectFinish = 0;
  for (const id of order) {
    const t = by.get(id); if (!t) continue;
    let start = new Date(t.expectedStart).getTime();
    const dur = Math.max(1, t.durationDays) * DAY;
    for (const d of deps.filter(x => x.successorId === id)) {
      const p = out.get(d.predecessorId); if (!p) continue;
      const lag = d.lagDays * DAY;
      if (d.dependencyType === "START_TO_START") start = Math.max(start, p.start + lag);
      else if (d.dependencyType === "FINISH_TO_FINISH") start = Math.max(start, p.finish + lag - dur);
      else if (d.dependencyType === "START_TO_FINISH") start = Math.max(start, p.start + lag - dur);
      else start = Math.max(start, p.finish + lag);
    }
    const finish = start + dur; out.set(id, { start, finish }); projectFinish = Math.max(projectFinish, finish);
  }
  return { projectFinish, tasks: out };
}

function buildCpm(tasks: any[], deps: any[]) {
  return computeSchedule(tasks.map(t => ({ id:t.id, expectedStart:new Date(t.expectedStart), expectedEnd:new Date(t.expectedEnd), durationDays:t.durationDays, isManualSchedule:t.isManualSchedule, targetDate:t.targetDate })), deps.map(d => ({ predecessorId:d.predecessorId, successorId:d.successorId, dependencyType:d.dependencyType, lagDays:d.lagDays, isActive:d.isActive })));
}

export async function intelligenceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireApiKey);

  // Explain the major drivers of schedule pressure using deterministic, auditable signals.
  app.get("/projects/:id/intelligence/health", { preHandler: requireScope("forecast:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, organizationId: req.organizationId! } });
    if (!project) return reply.code(404).send({ error: "Project not found" });
    const tasks = await prisma.task.findMany({ where: { projectId: id }, include: { assignments: { include: { resource: true } } } });
    const deps = await prisma.dependency.findMany({ where: { projectId: id, isActive: true } });
    const cpm = buildCpm(tasks, deps);
    const critical = tasks.filter(t => cpm.get(t.id)?.isCritical).length;
    const overdue = tasks.filter(t => t.targetDate && cpm.get(t.id) && cpm.get(t.id)!.expectedEnd.getTime() > t.targetDate.getTime()).length;
    const resourceLoads = new Map<string, number>();
    for (const t of tasks) for (const a of t.assignments) resourceLoads.set(a.resourceId, (resourceLoads.get(a.resourceId) || 0) + a.allocationPct);
    const overloaded = [...resourceLoads.entries()].filter(([rid,pct]) => pct > 100).map(([resourceId, allocationPct]) => ({ resourceId, allocationPct }));
    const score = Math.max(0, Math.min(100, Math.round(100 - critical * 2 - overdue * 8 - overloaded.length * 6)));
    const drivers = [
      { key:"critical_path", label:"Critical path pressure", weight: critical * 2, detail:`${critical} task${critical===1?"":"s"} currently critical.` },
      { key:"target_risk", label:"Target-date risk", weight: overdue * 8, detail:`${overdue} task${overdue===1?"":"s"} miss their configured target.` },
      { key:"resource_overload", label:"Resource overload", weight: overloaded.length * 6, detail:`${overloaded.length} resource${overloaded.length===1?"":"s"} exceed 100% allocation.` },
    ].sort((a,b)=>b.weight-a.weight);
    return { projectId:id, healthScore:score, criticalTaskCount:critical, targetRiskCount:overdue, overloadedResources:overloaded, drivers, generatedAt:new Date().toISOString() };
  });

  // Unified intelligence summary for the decision cockpit. It is read-only and aggregates
  // material signals so large projects do not require the browser to recompute everything.
  app.get("/projects/:id/intelligence/summary", { preHandler: requireScope("forecast:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, organizationId: req.organizationId! } });
    if (!project) return reply.code(404).send({ error: "Project not found", code: "PROJECT_NOT_FOUND" });
    const [tasks, deps, resources, latestForecast] = await Promise.all([
      prisma.task.findMany({ where: { projectId: id }, include: { assignments: true } }),
      prisma.dependency.findMany({ where: { projectId: id, isActive: true } }),
      prisma.resource.findMany({ where: { organizationId: req.organizationId! }, include: { assignments: { where: { task: { projectId: id } } } } }),
      prisma.forecastRun.findFirst({ where: { projectId: id }, orderBy: { createdAt: "desc" } }),
    ]);
    const cpm = buildCpm(tasks, deps);
    const critical = tasks.filter(t => cpm.get(t.id)?.isCritical);
    const targetRisk = tasks.filter(t => { const r = cpm.get(t.id); return !!t.targetDate && !!r && r.expectedEnd.getTime() > t.targetDate!.getTime(); });
    const overdue = tasks.filter(t => t.actualEnd == null && t.expectedEnd.getTime() < Date.now() && t.progressPct < 100);
    const loads = resources.map(r => ({ resourceId: r.id, name: r.name, allocationPct: r.assignments.reduce((n,a)=>n+a.allocationPct,0) })).sort((a,b)=>b.allocationPct-a.allocationPct);
    const overloaded = loads.filter(r=>r.allocationPct>100);
    const predecessorCount = new Map<string, number>(); const successorCount = new Map<string, number>();
    for (const d of deps) { predecessorCount.set(d.successorId,(predecessorCount.get(d.successorId)||0)+1); successorCount.set(d.predecessorId,(successorCount.get(d.predecessorId)||0)+1); }
    const hotspots = tasks.map(t=>({ taskId:t.id, name:t.name, critical:!!cpm.get(t.id)?.isCritical, slackDays:cpm.get(t.id)?.slackDays??null, targetRisk:targetRisk.some(x=>x.id===t.id), dependencyDegree:(predecessorCount.get(t.id)||0)+(successorCount.get(t.id)||0) }))
      .sort((a,b)=>(Number(b.critical)-Number(a.critical))+(b.dependencyDegree-a.dependencyDegree)).slice(0,12);
    const score = Math.max(0, Math.min(100, Math.round(100-critical.length*2-targetRisk.length*6-overloaded.length*7-overdue.length*3)));
    const signals = [
      { key:"target", severity: targetRisk.length ? "HIGH" : "LOW", title: targetRisk.length ? `${targetRisk.length} target-risk tasks` : "Targets are holding", detail: targetRisk.length ? "Computed finish dates exceed configured target dates." : "No configured task target is currently breached." },
      { key:"resources", severity: overloaded.length ? "HIGH" : "LOW", title: overloaded.length ? `${overloaded.length} overloaded resources` : "Resource pressure is contained", detail: overloaded.length ? "Aggregate assignment exceeds 100% capacity." : "No resource exceeds 100% aggregate allocation." },
      { key:"critical", severity: critical.length > Math.max(10, tasks.length*.08) ? "MEDIUM" : "LOW", title: `${critical.length} critical tasks`, detail: "Critical-path tasks have zero computed slack in the current schedule." },
      { key:"execution", severity: overdue.length ? "MEDIUM" : "LOW", title: overdue.length ? `${overdue.length} overdue work items` : "Execution is current", detail: overdue.length ? "Open tasks are past their computed finish date." : "No open task is past its computed finish date." },
    ];
    return { projectId:id, generatedAt:new Date().toISOString(), scale:{tasks:tasks.length,dependencies:deps.length,resources:resources.length}, healthScore:score, decision:score<65?"INTERVENTION_RECOMMENDED":score<85?"WATCH_PRESSURE":"PLAN_HEALTHY", signals, hotspots, resourcePressure:loads.slice(0,12), forecast:latestForecast?.result??null, drillDown:{criticalTaskIds:critical.slice(0,50).map(t=>t.id),targetRiskTaskIds:targetRisk.slice(0,50).map(t=>t.id),overloadedResourceIds:overloaded.map(r=>r.resourceId)} };
  });

  // Persist a what-if scenario for later comparison, while keeping the project unchanged.
  app.post("/projects/:id/scenarios", { preHandler: requireScope("projects:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as { name?: string; description?: string; changes?: Change[] };
    const project = await prisma.project.findFirst({ where:{ id, organizationId:req.organizationId! } });
    if (!project) return reply.code(404).send({ error:"Project not found" });
    const changes = body.changes || [];
    const validTasks = new Set((await prisma.task.findMany({ where:{ projectId:id }, select:{id:true} })).map(t=>t.id));
    if (changes.some(c=>!validTasks.has(c.taskId))) return reply.code(400).send({ error:"One or more scenario tasks do not belong to this project", code:"SCENARIO_TASK_INVALID" });
    const scenario = await prisma.scenario.create({ data:{ projectId:id, name:body.name?.trim() || `Scenario ${new Date().toLocaleString()}`, description:body.description, changes:{ create:changes.map(c=>({ taskId:c.taskId, expectedStart:c.expectedStart?new Date(c.expectedStart):undefined, expectedEnd:c.expectedEnd?new Date(c.expectedEnd):undefined, durationDays:c.durationDays })) } }, include:{changes:true} });
    return reply.code(201).send(scenario);
  });

  app.get("/projects/:id/scenarios", { preHandler: requireScope("projects:read") }, async (req, reply) => {
    const { id } = req.params as { id:string };
    const project = await prisma.project.findFirst({ where:{id,organizationId:req.organizationId!} }); if(!project)return reply.code(404).send({error:"Project not found"});
    return prisma.scenario.findMany({ where:{projectId:id}, include:{changes:true}, orderBy:{createdAt:"desc"} });
  });

  // Compare two saved scenarios or the current plan. No mutation.
  app.post("/projects/:id/scenarios/compare", { preHandler: requireScope("projects:read") }, async (req, reply) => {
    const { id } = req.params as { id:string }; const body=(req.body||{}) as { leftScenarioId?:string|null; rightScenarioId?:string|null };
    const project=await prisma.project.findFirst({where:{id,organizationId:req.organizationId!}}); if(!project)return reply.code(404).send({error:"Project not found"});
    const tasks=await prisma.task.findMany({where:{projectId:id}}); const deps=await prisma.dependency.findMany({where:{projectId:id,isActive:true}});
    const load = async (sid: string | null | undefined): Promise<any[] | null> => {
      if (!sid) return null;
      const sc = await prisma.scenario.findFirst({
        where: { id: sid, projectId: id },
        include: { changes: true },
      });
      if (!sc) return null;
      const changes = new Map(sc.changes.map((c) => [c.taskId, c]));
      return tasks.map((t) => {
        const c = changes.get(t.id);
        if (!c) return t;
        return {
          ...t,
          expectedStart: c.expectedStart ?? t.expectedStart,
          expectedEnd: c.expectedEnd ?? t.expectedEnd,
          durationDays: c.durationDays ?? t.durationDays,
        };
      });
    };
    const left = await load(body.leftScenarioId);
    const right = await load(body.rightScenarioId);
    const l=finishMap(left ?? tasks, deps), r=finishMap(right ?? tasks, deps);
    return {projectId:id,leftScenarioId:body.leftScenarioId??null,rightScenarioId:body.rightScenarioId??null,leftFinish:new Date(l.projectFinish).toISOString(),rightFinish:new Date(r.projectFinish).toISOString(),deltaDays:Math.round((r.projectFinish-l.projectFinish)/DAY)};
  });


  // Decision brief: one read-only, auditable response for executive dashboards.
  // It intentionally composes existing engines; it never mutates the schedule.
  app.get("/projects/:id/decision/brief", { preHandler: requireScope("forecast:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, organizationId: req.organizationId! } });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const [tasks, deps, resources, latestForecast] = await Promise.all([
      prisma.task.findMany({ where: { projectId: id }, include: { assignments: { include: { resource: true } } } }),
      prisma.dependency.findMany({ where: { projectId: id, isActive: true } }),
      prisma.resource.findMany({
        where: { organizationId: req.organizationId! },
        include: { assignments: { where: { task: { projectId: id } }, include: { task: true } } },
      }),
      prisma.forecastRun.findFirst({ where: { projectId: id }, orderBy: { createdAt: "desc" } }),
    ]);

    const cpm = buildCpm(tasks, deps);
    const critical = tasks.filter(t => cpm.get(t.id)?.isCritical);
    const targetRisks = tasks.filter(t => {
      const r = cpm.get(t.id);
      return !!t.targetDate && !!r && r.expectedEnd.getTime() > t.targetDate!.getTime();
    });
    const resourceSignals = resources.map(r => {
      const allocation = r.assignments.reduce((sum, a) => sum + a.allocationPct, 0);
      return { resourceId: r.id, name: r.name, allocationPct: allocation, overloaded: allocation > 100 };
    }).sort((a,b) => b.allocationPct - a.allocationPct);

    const healthScore = Math.max(0, Math.min(100, Math.round(
      100 - critical.length * 2 - targetRisks.length * 8 - resourceSignals.filter(r => r.overloaded).length * 6
    )));

    return {
      projectId: id,
      generatedAt: new Date().toISOString(),
      healthScore,
      criticalTaskCount: critical.length,
      targetRiskCount: targetRisks.length,
      overloadedResourceCount: resourceSignals.filter(r => r.overloaded).length,
      topCriticalTasks: critical.sort((a,b) => b.durationDays - a.durationDays).slice(0, 5).map(t => ({
        taskId: t.id, name: t.name, durationDays: t.durationDays, slackDays: cpm.get(t.id)?.slackDays ?? null
      })),
      resourceSignals: resourceSignals.slice(0, 10),
      latestForecast: latestForecast?.result ?? null,
      decision: targetRisks.length || resourceSignals.some(r => r.overloaded)
        ? "ATTENTION_REQUIRED"
        : "PLAN_HEALTHY",
    };
  });

  // Recovery suggestions are ranked previews. They never mutate the project.
  app.post("/projects/:id/recovery/recommendations", { preHandler: requireScope("forecast:read") }, async (req, reply) => {
    const { id }=req.params as {id:string}; const body=(req.body||{}) as {targetDate?:string};
    const project=await prisma.project.findFirst({where:{id,organizationId:req.organizationId!}}); if(!project)return reply.code(404).send({error:"Project not found"});
    const tasks=await prisma.task.findMany({where:{projectId:id},include:{assignments:{include:{resource:true}}}}); const deps=await prisma.dependency.findMany({where:{projectId:id,isActive:true}});
    const base=finishMap(tasks,deps); const target=body.targetDate?new Date(body.targetDate):tasks.map(t=>t.targetDate).filter(Boolean).sort((a,b)=>a!.getTime()-b!.getTime())[0]||null;
    const delayDays=target?Math.max(0,Math.round((base.projectFinish-target.getTime())/DAY)):0;
    const recommendations:any[]=[];
    const critical=buildCpm(tasks,deps);
    const criticalTasks=tasks.filter(t=>critical.get(t.id)?.isCritical).sort((a,b)=>b.durationDays-a.durationDays);
    if(delayDays>0 && criticalTasks.length) {
      const t=criticalTasks[0]; recommendations.push({id:"parallelize",title:"Parallelize the longest critical task",action:"Explore reducing its effective dependency pressure",expectedRecoveryDays:Math.max(1,Math.min(delayDays,Math.floor(t.durationDays*0.3))),risk:"MEDIUM",reason:`${t.name} is critical and has ${t.durationDays} days of duration.`});
      const a=t.assignments[0]; if(a) recommendations.push({id:"rebalance",title:"Rebalance a critical assignment",action:`Review ${a.resource.name}'s allocation on this task`,expectedRecoveryDays:Math.max(1,Math.min(delayDays,2)),risk:"LOW",reason:`${a.resource.name} is attached to a critical task.`});
      recommendations.push({id:"split",title:"Split a critical task into parallel work",action:"Preview a workstream split before applying",expectedRecoveryDays:Math.max(1,Math.min(delayDays,3)),risk:"HIGH",reason:"Parallel work can recover time but increases coordination risk."});
    }
    if(!recommendations.length) recommendations.push({id:"protect",title:"Protect the target",action:"Run Impact and Forecast before making a change",expectedRecoveryDays:0,risk:"LOW",reason:target?"The current deterministic schedule is already at or ahead of the target.":"No target date is configured yet."});
    return {projectId:id,currentFinish:new Date(base.projectFinish).toISOString(),targetDate:target?.toISOString()||null,delayDays,recommendations};
  });

  // Resource leveling insight: returns overload windows and safe candidates.
  app.get("/projects/:id/resources/leveling", { preHandler: requireScope("resources:read") }, async (req, reply) => {
    const {id}=req.params as {id:string}; const project=await prisma.project.findFirst({where:{id,organizationId:req.organizationId!}}); if(!project)return reply.code(404).send({error:"Project not found"});
    const resources=await prisma.resource.findMany({where:{organizationId:req.organizationId!},include:{assignments:{where:{task:{projectId:id}},include:{task:true}}}});
    const result=resources.map(r=>{const active=r.assignments.map(a=>({taskId:a.taskId,taskName:a.task.name,allocationPct:a.allocationPct,start:a.task.expectedStart.toISOString(),end:a.task.expectedEnd.toISOString()}));const total=active.reduce((s,a)=>s+a.allocationPct,0);return {resourceId:r.id,name:r.name,capacityHoursPerDay:r.capacityHoursPerDay,allocationPct:total,overloaded:total>100,assignments:active};}).sort((a,b)=>b.allocationPct-a.allocationPct);
    return {projectId:id,resources:result,overloadedCount:result.filter(r=>r.overloaded).length};
  });
}
