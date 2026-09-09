import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { requireApiKey, requireScope } from "../plugins/auth";
import { createResourceSchema, createAssignmentSchema } from "../schemas";

export async function resourceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireApiKey);

  // --- Resources: name, role, capacity only. No profiles, no chat, no CRM. ---

  app.post("/resources", { preHandler: requireScope("resources:write") }, async (req, reply) => {
    const body = createResourceSchema.parse(req.body);
    const resource = await prisma.resource.create({
      data: { ...body, organizationId: req.organizationId! },
    });
    return reply.code(201).send(resource);
  });

  app.get("/resources", { preHandler: requireScope("resources:read") }, async (req) => {
    return prisma.resource.findMany({ where: { organizationId: req.organizationId! } });
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

    const assignment = await prisma.assignment.upsert({
      where: { taskId_resourceId: { taskId, resourceId: body.resourceId } },
      create: { taskId, resourceId: body.resourceId, allocationPct: body.allocationPct },
      update: { allocationPct: body.allocationPct },
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
      assignmentId: a.id, taskId: a.taskId, taskName: a.task.name,
      start: a.task.expectedStart, end: a.task.expectedEnd,
      allocationPct: a.allocationPct,
      allocatedHoursPerDay: (resource.capacityHoursPerDay * a.allocationPct) / 100,
    }));
    const events = items.flatMap((x) => [
      { at: x.start.getTime(), delta: x.allocationPct },
      { at: x.end.getTime(), delta: -x.allocationPct },
    ]).sort((a,b) => a.at-b.at || b.delta-a.delta);
    let active=0, peak=0, peakAt: number|null=null;
    for (const e of events) { active += e.delta; if (active > peak) { peak=active; peakAt=e.at; } }
    return { resourceId:id, capacityHoursPerDay:resource.capacityHoursPerDay, peakAllocationPct:Math.round(peak*10)/10, peakAllocatedHoursPerDay:Math.round(resource.capacityHoursPerDay*peak/100*10)/10, overloaded:peak>100, peakAt:peakAt===null?null:new Date(peakAt).toISOString(), assignments:items };
  });
}
