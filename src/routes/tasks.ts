import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { requireApiKey, requireScope } from "../plugins/auth";
import { createTaskSchema, updateTaskSchema } from "../schemas";
import { z } from "zod";
import { recomputeProjectSchedule } from "../scheduling/recompute";

const DAY_MS = 86_400_000;
const durationDays = (start: Date, end: Date) =>
  Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));

async function assertProjectOwned(orgId: string, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
}

function withComputedFields(task: any, result?: Map<string, any>) {
  const r = result?.get(task.id);
  return {
    ...task,
    isCritical: r?.isCritical ?? task.scheduleResult?.isCritical ?? null,
    slackDays: r?.slackDays ?? task.scheduleResult?.slackDays ?? null,
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
      include: { scheduleResult: true },
      orderBy: [{ sortOrder: "asc" }, { expectedStart: "asc" }],
    });
    return tasks.map((t) => withComputedFields(t));
  });

  app.get("/tasks/:id", { preHandler: requireScope("tasks:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await prisma.task.findFirst({
      where: { id, project: { organizationId: req.organizationId! } },
      include: { scheduleResult: true, assignments: { include: { resource: true } } },
    });
    if (!task) return reply.code(404).send({ error: "Task not found" });
    return withComputedFields(task);
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
