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
        durationDays: Math.max(1, Math.ceil((body.expectedEnd.getTime()-body.expectedStart.getTime())/DAY_MS)),
        durationMinutes: body.durationMinutes ?? Math.max(1, Math.round((body.expectedEnd.getTime()-body.expectedStart.getTime())/60000)),
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
  // Every schedule-date mutation is atomic. If propagation, CPM recompute,
  // validation, or persistence fails, Prisma rolls the entire edit back.
  app.patch("/tasks/:id", { preHandler: requireScope("tasks:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateTaskSchema.parse(req.body);

    let changedIds: string[] = [];
    let results: Map<string, any>;
    let refreshed: any;

    try {
      const transactionResult = await prisma.$transaction(async (tx) => {
        const existing = await tx.task.findFirst({
          where: { id, project: { organizationId: req.organizationId! } },
        });
        if (!existing) throw new Error("Task not found");

        const allBefore = await tx.task.findMany({ where: { projectId: existing.projectId } });
        const beforeById = new Map(allBefore.map(t => [t.id, t]));

        let nextStart = body.expectedStart ?? existing.expectedStart;
        let nextEnd = body.expectedEnd ?? existing.expectedEnd;
        const durationWasProvided = body.durationMinutes !== undefined;
        if (durationWasProvided && body.expectedEnd === undefined) {
          nextEnd = new Date(nextStart.getTime() + Math.max(1, body.durationMinutes!) * 60000);
        }
        if (durationWasProvided && body.expectedStart === undefined && body.expectedEnd !== undefined) {
          nextStart = new Date(nextEnd.getTime() - Math.max(1, body.durationMinutes!) * 60000);
        }

        if (nextEnd < nextStart) {
          throw new Error("expectedEnd cannot be before expectedStart");
        }

        const childrenByParent = new Map<string, any[]>();
        for (const t of allBefore) {
          if (!t.parentId) continue;
          const list = childrenByParent.get(t.parentId) ?? [];
          list.push(t);
          childrenByParent.set(t.parentId, list);
        }

        const descendants: any[] = [];
        const descendantIds = new Set<string>();
        const walkDescendants = (parentId: string) => {
          for (const child of childrenByParent.get(parentId) ?? []) {
            if (descendantIds.has(child.id)) continue;
            descendantIds.add(child.id);
            descendants.push(child);
            walkDescendants(child.id);
          }
        };
        walkDescendants(id);

        const datesTouched = body.expectedStart !== undefined || body.expectedEnd !== undefined;
        const isManualSchedule =
          body.isManualSchedule !== undefined
            ? body.isManualSchedule
            : datesTouched
              ? true
              : existing.isManualSchedule;

        const isParentEdit = descendants.length > 0 && datesTouched;

        if (isParentEdit) {
          const oldStartMs = existing.expectedStart.getTime();
          const oldEndMs = existing.expectedEnd.getTime();
          const newStartMs = nextStart.getTime();
          const newEndMs = nextEnd.getTime();

          const startChanged = newStartMs !== oldStartMs;
          const endChanged = newEndMs !== oldEndMs;

          if (startChanged && !endChanged) {
            const delta = newStartMs - oldStartMs;
            nextEnd = new Date(oldEndMs + delta);
          }

          const effectiveEndMs = nextEnd.getTime();
          const moveDelta = newStartMs - oldStartMs;
          const effectiveDuration = effectiveEndMs - newStartMs;
          const oldDuration = Math.max(1, oldEndMs - oldStartMs);
          const pureMove = Math.abs(effectiveDuration - oldDuration) < 1000;

          for (const child of descendants) {
            let childStartMs: number;
            let childEndMs: number;

            if (pureMove) {
              childStartMs = child.expectedStart.getTime() + moveDelta;
              childEndMs = child.expectedEnd.getTime() + moveDelta;
            } else {
              const startRatio = (child.expectedStart.getTime() - oldStartMs) / oldDuration;
              const endRatio = (child.expectedEnd.getTime() - oldStartMs) / oldDuration;
              childStartMs = newStartMs + startRatio * effectiveDuration;
              childEndMs = newStartMs + endRatio * effectiveDuration;
              if (childEndMs <= childStartMs) childEndMs = childStartMs + DAY_MS;
            }

            const childStart = new Date(Math.round(childStartMs));
            const childEnd = new Date(Math.round(childEndMs));

            if (childEnd < childStart) {
              throw new Error(`Schedule propagation produced an invalid range for "${child.name}".`);
            }

            await tx.task.update({
              where: { id: child.id },
              data: {
                expectedStart: childStart,
                expectedEnd: childEnd,
                durationDays: Math.max(1, Math.ceil((childEnd.getTime()-childStart.getTime())/DAY_MS)),
                durationMinutes: Math.max(1, Math.round((childEnd.getTime()-childStart.getTime())/60000)),
                isManualSchedule: true,
              },
            });
          }
        }

        const task = await tx.task.update({
          where: { id },
          data: {
            ...body,
            expectedStart: nextStart,
            expectedEnd: nextEnd,
            durationDays: datesTouched || durationWasProvided ? Math.max(1, Math.ceil((nextEnd.getTime()-nextStart.getTime())/DAY_MS)) : undefined,
            durationMinutes: datesTouched || durationWasProvided ? Math.max(1, Math.round((nextEnd.getTime()-nextStart.getTime())/60000)) : undefined,
            isManualSchedule,
          },
        });

        // Recompute inside the same transaction. Any exception/time-out causes
        // Prisma to restore the parent, descendants and schedule results.
        const computed = await recomputeProjectSchedule(tx, existing.projectId);

        const allAfter = await tx.task.findMany({ where: { projectId: existing.projectId } });
        changedIds = allAfter
          .filter(t => {
            const before = beforeById.get(t.id);
            return !!before && (
              before.expectedStart.getTime() !== t.expectedStart.getTime() ||
              before.expectedEnd.getTime() !== t.expectedEnd.getTime()
            );
          })
          .map(t => t.id);

        refreshed = await tx.task.findUnique({
          where: { id: task.id },
          include: { scheduleResult: true, assignments: { include: { resource: true } } },
        });

        return { computed };
      }, { timeout: 30000, maxWait: 10000 });

      results = transactionResult.computed;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Schedule change could not be applied";
      if (message === "Task not found") return reply.code(404).send({ error: message });

      req.log.warn({ taskId: id, error: message }, "Schedule edit rejected and rolled back");
      return reply.code(409).send({
        error: "Schedule change rejected",
        reason: message,
        rolledBack: true,
      });
    }

    // External connector synchronization happens only after the local
    // transaction commits. A connector failure can therefore never corrupt or
    // freeze the local SI schedule.
    if (changedIds.length) {
      void Promise.allSettled(
        changedIds.map((changedId) => pushTaskUpdate(changedId, req.organizationId!))
      ).then((settled) => {
        const failures = settled.filter((r) => r.status === "rejected");
        if (failures.length) {
          req.log.warn(
            { taskCount: changedIds.length, failedCount: failures.length },
            "Background connector write-back failed; committed SI schedule retained"
          );
        }
      });
    }

    return {
      ...withComputedFields(refreshed, results),
      scheduleSync: changedIds.length ? "BACKGROUND" : "NONE",
      changedTaskCount: changedIds.length,
      rolledBack: false,
    };
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
