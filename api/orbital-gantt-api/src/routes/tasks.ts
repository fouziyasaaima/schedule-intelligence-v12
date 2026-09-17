import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { requireApiKey, requireScope } from "../plugins/auth";
import { createTaskSchema, updateTaskSchema } from "../schemas";
import { z } from "zod";
import { recomputeProjectSchedule } from "../scheduling/recompute";
import { pushTaskUpdate } from "../connectors/service";

const DAY_MS = 86_400_000;
const durationDays = (start: Date, end: Date) =>
  Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));

async function assertProjectOwned(orgId: string, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
}

function withComputedFields(task: any, result?: Map<string, any>, identity?: { externalId?: string | null; provider?: string | null }) {
  const r = result?.get(task.id);
  return {
    ...task,
    externalId: identity?.externalId ?? task.externalId ?? null,
    source: identity?.provider ?? task.source ?? null,
    displayId: identity?.externalId ?? task.externalId ?? `SI-${String(task.id).slice(-6).toUpperCase()}`,
    isCritical: r?.isCritical ?? task.scheduleResult?.isCritical ?? null,
    slackDays: r?.slackDays ?? task.scheduleResult?.slackDays ?? null,
    resourceAssignments: Array.isArray(task.assignments) ? task.assignments.map((a:any) => ({
      id: a.id, resourceId: a.resourceId, resourceName: a.resource?.name ?? null,
      role: a.role ?? null, allocationPct: a.allocationPct,
    })) : undefined,
  };
}

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireApiKey);

  // Create a task. expectedStart/expectedEnd here work identically whether
  // the caller derived them from a drag interaction or a typed date field —
  // there is no separate "drag endpoint."
  app.post("/projects/:projectId/tasks", { preHandler: requireScope("tasks:write") }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await assertProjectOwned(req.organizationId!, projectId);
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const body = createTaskSchema.parse(req.body);
    if (body.expectedEnd < body.expectedStart) {
      return reply.code(400).send({ error: "expectedEnd cannot be before expectedStart" });
    }

    const task = await prisma.task.create({
      data: {
        projectId,
        parentId: body.parentId,
        taskType: body.taskType,
        name: body.name,
        description: body.description,
        expectedStart: body.expectedStart,
        expectedEnd: body.expectedEnd,
        durationDays: durationDays(body.expectedStart, body.expectedEnd),
        targetDate: body.targetDate,
        sortOrder: body.sortOrder ?? 0,
        // A brand-new task with an explicit date range is, by definition, manually placed
        // until a dependency is later added that should drive it.
        isManualSchedule: true,
      },
    });

    const results = await recomputeProjectSchedule(prisma, projectId);
    return reply.code(201).send(withComputedFields(task, results));
  });

  app.get("/projects/:projectId/tasks", { preHandler: requireScope("tasks:read") }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await assertProjectOwned(req.organizationId!, projectId);
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const tasks = await prisma.task.findMany({
      where: { projectId },
      include: { scheduleResult: true, assignments: { include: { resource: true } } },
      orderBy: [{ sortOrder: "asc" }, { expectedStart: "asc" }],
    });
    const identities = await prisma.connectorIdentity.findMany({
      where: { entityType: "task", internalId: { in: tasks.map(t => t.id) }, connector: { organizationId: req.organizationId! } },
      include: { connector: { select: { provider: true } } },
    });
    const identityByTask = new Map<string, { externalId:string; provider:string }>();
    for (const i of identities) if (!identityByTask.has(i.internalId)) identityByTask.set(i.internalId, { externalId:i.externalId, provider:i.connector.provider });
    return tasks.map((t) => withComputedFields(t, undefined, identityByTask.get(t.id)));
  });

  app.get("/tasks/:id", { preHandler: requireScope("tasks:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await prisma.task.findFirst({
      where: { id, project: { organizationId: req.organizationId! } },
      include: { scheduleResult: true, assignments: { include: { resource: true } } },
    });
    if (!task) return reply.code(404).send({ error: "Task not found" });
    const identity = await prisma.connectorIdentity.findFirst({ where: { entityType:"task", internalId:id, connector:{organizationId:req.organizationId!}}, include:{connector:{select:{provider:true}}} });
    return withComputedFields(task, undefined, identity ? {externalId:identity.externalId,provider:identity.connector.provider} : undefined);
  });

  // The single mutation endpoint for every date change: drag handle, typed
  // date field, or a target date being set — all PATCH here.
  app.patch("/tasks/:id", { preHandler: requireScope("tasks:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.task.findFirst({
      where: { id, project: { organizationId: req.organizationId! } },
    });
    if (!existing) return reply.code(404).send({ error: "Task not found" });

    const body = updateTaskSchema.parse(req.body);
    const hasChildren = await prisma.task.count({ where: { parentId: id } });
    if (hasChildren > 0 && (body.expectedStart !== undefined || body.expectedEnd !== undefined)) {
      return reply.code(400).send({ error: "Summary task dates are calculated from child tasks", code: "SUMMARY_DATES_DERIVED" });
    }

    const nextStart = body.expectedStart ?? existing.expectedStart;
    const nextEnd = body.expectedEnd ?? existing.expectedEnd;
    if (nextEnd < nextStart) {
      return reply.code(400).send({ error: "expectedEnd cannot be before expectedStart" });
    }

    // Typing or dragging a date pins the task, unless the caller explicitly
    // says otherwise (e.g. re-linking it back into auto-scheduling).
    const datesTouched = body.expectedStart !== undefined || body.expectedEnd !== undefined;
    const isManualSchedule =
      body.isManualSchedule !== undefined ? body.isManualSchedule : datesTouched ? true : existing.isManualSchedule;

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...body,
        durationDays: datesTouched ? durationDays(nextStart, nextEnd) : undefined,
        isManualSchedule,
      },
    });

    const results = await recomputeProjectSchedule(prisma, existing.projectId);
    try {
      await pushTaskUpdate(task.id, req.organizationId!);
    } catch (e:any) {
      await prisma.task.update({where:{id},data:{expectedStart:existing.expectedStart,expectedEnd:existing.expectedEnd,durationDays:existing.durationDays,isManualSchedule:existing.isManualSchedule}});
      await recomputeProjectSchedule(prisma, existing.projectId);
      return reply.code(502).send({error:"The external source rejected the schedule update. The local change was rolled back.",code:e?.code||"CONNECTOR_WRITEBACK_FAILED",details:process.env.NODE_ENV==="production"?undefined:String(e?.message||e)});
    }
    return withComputedFields(task, results);
  });

  app.delete("/tasks/:id", { preHandler: requireScope("tasks:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.task.findFirst({
      where: { id, project: { organizationId: req.organizationId! } },
    });
    if (!existing) return reply.code(404).send({ error: "Task not found" });

    await prisma.task.delete({ where: { id } });
    await recomputeProjectSchedule(prisma, existing.projectId);
    return reply.code(204).send();
  });

  // Sets (or clears) a goal date without moving the task itself — see the
  // target_date design discussion. Returns whether the current schedule
  // actually hits it.
  app.post("/tasks/:id/target", { preHandler: requireScope("tasks:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.task.findFirst({
      where: { id, project: { organizationId: req.organizationId! } },
    });
    if (!existing) return reply.code(404).send({ error: "Task not found" });

    const parsedTarget = z.object({ targetDate: z.coerce.date().nullable() }).safeParse(req.body);
    if (!parsedTarget.success) return reply.code(400).send({ error: "Invalid targetDate", code: "VALIDATION_ERROR", details: parsedTarget.error.issues });
    const { targetDate } = parsedTarget.data;
    await prisma.task.update({
      where: { id },
      data: { targetDate },
    });

    const results = await recomputeProjectSchedule(prisma, existing.projectId);
    const r = results.get(id)!;
    return {
      taskId: id,
      targetDate: targetDate ? targetDate.toISOString() : null,
      computedFinish: r.expectedEnd,
      targetFeasible: r.targetFeasible,
      slipDays: targetDate
        ? Math.max(
            0,
            Math.round((r.expectedEnd.getTime() - targetDate.getTime()) / DAY_MS)
          )
        : null,
    };
  });
}
