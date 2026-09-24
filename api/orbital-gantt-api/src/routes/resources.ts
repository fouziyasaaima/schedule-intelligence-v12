import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { requireApiKey, requireScope } from "../plugins/auth";
import { createResourceSchema, updateResourceSchema, createAssignmentSchema } from "../schemas";
import { computeSchedule } from "../scheduling/cpm";

export async function resourceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireApiKey);

  // --- Resources: name, role, capacity only. No profiles, no chat, no CRM. ---

  app.post("/resources", { preHandler: requireScope("resources:write") }, async (req, reply) => {
    const body = createResourceSchema.parse(req.body);
    const { projectId, ...resourceBody } = body;
    if (projectId) {
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: req.organizationId! }, select: { id: true } });
      if (!project) return reply.code(400).send({ error: "Project not found" });
    }
    const resource = await prisma.resource.create({ data: { ...resourceBody, organizationId: req.organizationId! } });
    if (projectId) await prisma.projectResource.create({ data: { projectId, resourceId: resource.id } });
    return reply.code(201).send(resource);
  });

  // Project-scoped resource view: only resources actually assigned to tasks in the selected project.
  // This keeps Resource Orbit project-specific instead of exposing the whole organization roster.
  app.get("/projects/:id/resources", { preHandler: requireScope("resources:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, organizationId: req.organizationId! }, select: { id: true } });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    // If the project came from a connector (for example PRMS), keep the Orbit
    // resource roster on the same connector. This prevents unrelated
    // organization-wide resources from leaking into a project view.
    const projectIdentity = await prisma.connectorIdentity.findFirst({
      where: { entityType: "project", internalId: id, connector: { organizationId: req.organizationId! } },
      select: { connectorId: true },
    });
    // Project membership is the source of truth for Resource Orbit.
    // Imported PRMS resources are included through their task assignments / project links,
    // while resources created locally from the Add Resource form are included through the
    // projectLinks row created with projectId. Do not apply a connector-wide resource filter
    // here: that filter used to hide newly-created local resources from connector-backed projects.
    const resources = await prisma.resource.findMany({
      where: {
        organizationId: req.organizationId!,
        OR: [
          { assignments: { some: { task: { projectId: id } } } },
          { projectLinks: { some: { projectId: id, active: true } } },
        ],
      },
      include: {
        assignments: { where: { task: { projectId: id } }, include: { task: { select: { id: true, name: true, expectedStart: true, expectedEnd: true } } } },
      },
      orderBy: { name: "asc" },
    });

    const identities = await prisma.connectorIdentity.findMany({
      where: { entityType: "resource", internalId: { in: resources.map(r => r.id) }, connector: { organizationId: req.organizationId! } },
      include: { connector: { select: { provider: true } } },
    });
    const identityByResource = new Map<string, { externalId: string; provider: string }>();
    for (const identity of identities) {
      if (!identityByResource.has(identity.internalId)) {
        identityByResource.set(identity.internalId, { externalId: identity.externalId.replace(/^MEMBER:/, ""), provider: identity.connector.provider });
      }
    }

    return resources.map(resource => ({
      ...resource,
      assignments: resource.assignments.map(a => ({
        id: a.id, taskId: a.taskId, taskName: a.task.name, allocationPct: a.allocationPct, units: a.units, role: a.role ?? null,
        start: a.task.expectedStart.toISOString(), end: a.task.expectedEnd.toISOString(),
      })),
      assignmentCount: resource.assignments.length,
      externalId: identityByResource.get(resource.id)?.externalId ?? null,
      source: identityByResource.get(resource.id)?.provider ?? null,
    }));
  });



  // Large-data scheduling intelligence: return a compact, deterministic index rather
  // than forcing the browser to inspect/render the entire task universe. MAC and the
  // Resource workspace use this as the materiality layer for large projects.
  app.get("/projects/:id/resource-intelligence", { preHandler: requireScope("resources:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, organizationId: req.organizationId! }, select: { id: true, name: true, startDate: true, status: true } });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const [tasks, deps, resources] = await Promise.all([
      prisma.task.findMany({ where: { projectId: id }, include: { assignments: true }, orderBy: { sortOrder: "asc" } }),
      prisma.dependency.findMany({ where: { projectId: id, isActive: true } }),
      prisma.resource.findMany({
        where: { organizationId: req.organizationId!, OR: [{ projectLinks: { some: { projectId: id, active: true } } }, { assignments: { some: { task: { projectId: id } } } }] },
        include: { assignments: { where: { task: { projectId: id } } } }, orderBy: { name: "asc" },
      }),
    ]);

    const cpm = computeSchedule(tasks.map(t => ({ id: t.id, expectedStart: t.expectedStart, expectedEnd: t.expectedEnd, durationDays: t.durationDays, isManualSchedule: t.isManualSchedule, targetDate: t.targetDate })), deps.map(d => ({ predecessorId: d.predecessorId, successorId: d.successorId, dependencyType: d.dependencyType, lagDays: d.lagDays, isActive: d.isActive })));
    const assigned = new Set(tasks.flatMap(t => t.assignments.map(a => a.taskId)));
    const now = Date.now();
    const depDegree = new Map<string, number>();
    for (const d of deps) { depDegree.set(d.predecessorId, (depDegree.get(d.predecessorId) || 0) + 1); depDegree.set(d.successorId, (depDegree.get(d.successorId) || 0) + 1); }
    const scoredTasks = tasks.map(t => {
      const r = cpm.get(t.id);
      const targetRisk = !!t.targetDate && !!r && r.expectedEnd.getTime() > t.targetDate.getTime();
      const overdue = !t.actualEnd && t.progressPct < 100 && t.expectedEnd.getTime() < now;
      const unassigned = !assigned.has(t.id) && t.taskType !== "SUMMARY";
      const score = (unassigned ? 40 : 0) + (r?.isCritical ? 30 : 0) + (targetRisk ? 24 : 0) + (overdue ? 20 : 0) + Math.max(0, 16 - Math.max(0, r?.slackDays ?? 16)) + Math.min(12, (depDegree.get(t.id) || 0) * 2);
      return { id: t.id, name: t.name, taskType: t.taskType, expectedStart: t.expectedStart.toISOString(), expectedEnd: t.expectedEnd.toISOString(), progressPct: t.progressPct, status: t.status, assigned: assigned.has(t.id), critical: !!r?.isCritical, slackDays: r?.slackDays ?? null, targetRisk, overdue, parentId: t.parentId, score };
    }).sort((a,b) => b.score - a.score);

    const resourceSignals = resources.map(r => {
      const allocation = r.assignments.reduce((sum,a) => sum + a.allocationPct, 0);
      const available = Math.max(0, (r.availabilityPct || 100) - allocation);
      return { id: r.id, name: r.name, type: r.type, role: r.role, capacityHoursPerDay: r.capacityHoursPerDay, capacityUnits: r.capacityUnits, unitLabel: r.unitLabel, availabilityPct: r.availabilityPct, allocationPct: allocation, availablePct: available, assignmentCount: r.assignments.length, overloaded: allocation > (r.availabilityPct || 100) };
    }).sort((a,b) => b.allocationPct - a.allocationPct);

    const large = tasks.length >= 1000 || resources.length >= 60;
    return {
      project,
      largeDataset: large,
      strategy: large ? "MATERIALITY_FIRST" : "DIRECT",
      counts: {
        tasks: tasks.length,
        assignedTasks: assigned.size,
        unassignedTasks: scoredTasks.filter(t => t.score >= 40 && !t.assigned).length,
        criticalTasks: scoredTasks.filter(t => t.critical).length,
        targetRiskTasks: scoredTasks.filter(t => t.targetRisk).length,
        overdueTasks: scoredTasks.filter(t => t.overdue).length,
        resources: resources.length,
        overloadedResources: resourceSignals.filter(r => r.overloaded).length,
      },
      materialTasks: scoredTasks.slice(0, 80).map(({score, ...t}) => t),
      pressureResources: resourceSignals.slice(0, 30),
    };
  });

  app.get("/resources", { preHandler: requireScope("resources:read") }, async (req) => {
    const resources=await prisma.resource.findMany({ where: { organizationId: req.organizationId! } });
    const ids=await prisma.connectorIdentity.findMany({where:{entityType:"resource",internalId:{in:resources.map(r=>r.id)},connector:{organizationId:req.organizationId!}},include:{connector:{select:{provider:true}}}});
    const identityByResource=new Map<string,{externalId:string;provider:string}>(); for(const i of ids) if(!identityByResource.has(i.internalId)) identityByResource.set(i.internalId,{externalId:i.externalId.replace(/^MEMBER:/,""),provider:i.connector.provider});
    return resources.map(r=>({...r,externalId:identityByResource.get(r.id)?.externalId??null,source:identityByResource.get(r.id)?.provider??null}));
  });

  app.patch("/resources/:id", { preHandler: requireScope("resources:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.resource.findFirst({ where: { id, organizationId: req.organizationId! } });
    if (!existing) return reply.code(404).send({ error: "Resource not found" });
    const body = updateResourceSchema.parse(req.body);
    const updated = await prisma.resource.update({ where: { id }, data: body });
    return updated;
  });

  app.delete("/resources/:id", { preHandler: requireScope("resources:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.resource.findFirst({
      where: { id, organizationId: req.organizationId! },
    });
    if (!existing) return reply.code(404).send({ error: "Resource not found" });

    await prisma.resource.delete({ where: { id } });
    return reply.code(204).send();
  });

  // --- Assignments: resource <-> task allocation ---

  app.post("/tasks/:taskId/assignments", { preHandler: requireScope("resources:write") }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const task = await prisma.task.findFirst({
      where: { id: taskId, project: { organizationId: req.organizationId! } },
    });
    if (!task) return reply.code(404).send({ error: "Task not found" });

    const body = createAssignmentSchema.parse(req.body);
    const resource = await prisma.resource.findFirst({
      where: { id: body.resourceId, organizationId: req.organizationId! },
    });
    if (!resource) return reply.code(400).send({ error: "Resource not found" });

    const units = body.units ?? 1;
    const allocationPct = body.allocationPct ?? Math.max(1, Math.min(100, Math.round((units / Math.max(resource.capacityUnits, 0.0001)) * 100)));
    const assignment = await prisma.assignment.upsert({
      where: { taskId_resourceId: { taskId, resourceId: body.resourceId } },
      create: { taskId, resourceId: body.resourceId, allocationPct, units, role: body.role },
      update: { allocationPct, units, role: body.role },
    });
    return reply.code(201).send(assignment);
  });

  app.delete("/assignments/:id", { preHandler: requireScope("resources:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.assignment.findFirst({
      where: { id, task: { project: { organizationId: req.organizationId! } } },
    });
    if (!existing) return reply.code(404).send({ error: "Assignment not found" });

    await prisma.assignment.delete({ where: { id } });
    return reply.code(204).send();
  });

  // Simple workload view: allocated hours/day per resource vs. capacity.
  // Full auto-leveling (Phase 5 differentiator) builds on top of this.
  app.get("/resources/:id/workload", { preHandler: requireScope("resources:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const resource = await prisma.resource.findFirst({
      where: { id, organizationId: req.organizationId! },
      include: { assignments: { include: { task: true } } },
    });
    if (!resource) return reply.code(404).send({ error: "Resource not found" });

    const items = resource.assignments.map((a) => ({
      assignmentId: a.id, taskId: a.taskId, taskName: a.task.name, role: a.role ?? null,
      start: a.task.expectedStart, end: a.task.expectedEnd,
      allocationPct: a.allocationPct,
      allocatedHoursPerDay: (resource.capacityHoursPerDay * a.allocationPct * (resource.availabilityPct / 100)) / 100,
    }));
    const events = items.flatMap((x) => [
      { at: x.start.getTime(), delta: x.allocationPct },
      { at: x.end.getTime(), delta: -x.allocationPct },
    ]).sort((a,b) => a.at-b.at || b.delta-a.delta);
    let active=0, peak=0, peakAt: number|null=null;
    for (const e of events) { active += e.delta; if (active > peak) { peak=active; peakAt=e.at; } }
    return { resourceId:id, capacityHoursPerDay:resource.capacityHoursPerDay, capacityUnits:resource.capacityUnits, unitLabel:resource.unitLabel, availabilityPct:resource.availabilityPct, peakAllocationPct:Math.round(peak*10)/10, peakAllocatedHoursPerDay:Math.round(resource.capacityHoursPerDay*peak/100*10)/10, overloaded:peak>(resource.availabilityPct||100), peakAt:peakAt===null?null:new Date(peakAt).toISOString(), assignments:items };
  });
}
