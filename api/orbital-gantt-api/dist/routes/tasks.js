"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskRoutes = taskRoutes;
const db_1 = require("../db");
const auth_1 = require("../plugins/auth");
const schemas_1 = require("../schemas");
const zod_1 = require("zod");
const recompute_1 = require("../scheduling/recompute");
const service_1 = require("../connectors/service");
const DAY_MS = 86_400_000;
const durationDays = (start, end) => Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
async function assertProjectOwned(orgId, projectId) {
    return db_1.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
}
function withComputedFields(task, result, identity) {
    const r = result?.get(task.id);
    return {
        ...task,
        externalId: identity?.externalId ?? task.externalId ?? null,
        source: identity?.provider ?? task.source ?? null,
        displayId: identity?.externalId ?? task.externalId ?? `SI-${String(task.id).slice(-6).toUpperCase()}`,
        isCritical: r?.isCritical ?? task.scheduleResult?.isCritical ?? null,
        slackDays: r?.slackDays ?? task.scheduleResult?.slackDays ?? null,
        resourceAssignments: Array.isArray(task.assignments) ? task.assignments.map((a) => ({
            id: a.id, resourceId: a.resourceId, resourceName: a.resource?.name ?? null,
            role: a.role ?? null, allocationPct: a.allocationPct,
        })) : undefined,
    };
}
async function taskRoutes(app) {
    app.addHook("preHandler", auth_1.requireApiKey);
    // Create a task. expectedStart/expectedEnd here work identically whether
    // the caller derived them from a drag interaction or a typed date field —
    // there is no separate "drag endpoint."
    app.post("/projects/:projectId/tasks", { preHandler: (0, auth_1.requireScope)("tasks:write") }, async (req, reply) => {
        const { projectId } = req.params;
        const project = await assertProjectOwned(req.organizationId, projectId);
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        const body = schemas_1.createTaskSchema.parse(req.body);
        if (body.expectedEnd < body.expectedStart) {
            return reply.code(400).send({ error: "expectedEnd cannot be before expectedStart" });
        }
        const task = await db_1.prisma.task.create({
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
        const results = await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, projectId);
        return reply.code(201).send(withComputedFields(task, results));
    });
    app.get("/projects/:projectId/tasks", { preHandler: (0, auth_1.requireScope)("tasks:read") }, async (req, reply) => {
        const { projectId } = req.params;
        const project = await assertProjectOwned(req.organizationId, projectId);
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        const tasks = await db_1.prisma.task.findMany({
            where: { projectId },
            include: { scheduleResult: true, assignments: { include: { resource: true } } },
            orderBy: [{ sortOrder: "asc" }, { expectedStart: "asc" }],
        });
        const identities = await db_1.prisma.connectorIdentity.findMany({
            where: { entityType: "task", internalId: { in: tasks.map(t => t.id) }, connector: { organizationId: req.organizationId } },
            include: { connector: { select: { provider: true } } },
        });
        const identityByTask = new Map();
        for (const i of identities)
            if (!identityByTask.has(i.internalId))
                identityByTask.set(i.internalId, { externalId: i.externalId, provider: i.connector.provider });
        return tasks.map((t) => withComputedFields(t, undefined, identityByTask.get(t.id)));
    });
    app.get("/tasks/:id", { preHandler: (0, auth_1.requireScope)("tasks:read") }, async (req, reply) => {
        const { id } = req.params;
        const task = await db_1.prisma.task.findFirst({
            where: { id, project: { organizationId: req.organizationId } },
            include: { scheduleResult: true, assignments: { include: { resource: true } } },
        });
        if (!task)
            return reply.code(404).send({ error: "Task not found" });
        const identity = await db_1.prisma.connectorIdentity.findFirst({ where: { entityType: "task", internalId: id, connector: { organizationId: req.organizationId } }, include: { connector: { select: { provider: true } } } });
        return withComputedFields(task, undefined, identity ? { externalId: identity.externalId, provider: identity.connector.provider } : undefined);
    });
    // The single mutation endpoint for every date change: drag handle, typed
    // date field, or a target date being set — all PATCH here.
    app.patch("/tasks/:id", { preHandler: (0, auth_1.requireScope)("tasks:write") }, async (req, reply) => {
        const { id } = req.params;
        const existing = await db_1.prisma.task.findFirst({
            where: { id, project: { organizationId: req.organizationId } },
        });
        if (!existing)
            return reply.code(404).send({ error: "Task not found" });
        const body = schemas_1.updateTaskSchema.parse(req.body);
        const allBefore = await db_1.prisma.task.findMany({ where: { projectId: existing.projectId } });
        const beforeById = new Map(allBefore.map(t => [t.id, t]));
        let nextStart = body.expectedStart ?? existing.expectedStart;
        let nextEnd = body.expectedEnd ?? existing.expectedEnd;
        // Hierarchy is different from dependency logic:
        // parentId describes containment, while Dependency describes scheduling
        // constraints. A parent date edit therefore propagates through its
        // descendants; a child edit is allowed to expand/shrink the parent's
        // derived range during the normal recompute pass.
        const childrenByParent = new Map();
        for (const t of allBefore) {
            if (!t.parentId)
                continue;
            const list = childrenByParent.get(t.parentId) ?? [];
            list.push(t);
            childrenByParent.set(t.parentId, list);
        }
        const descendants = [];
        const walkDescendants = (parentId) => {
            for (const child of childrenByParent.get(parentId) ?? []) {
                if (descendants.some(x => x.id === child.id))
                    continue;
                descendants.push(child);
                walkDescendants(child.id);
            }
        };
        walkDescendants(id);
        if (nextEnd < nextStart) {
            return reply.code(400).send({ error: "expectedEnd cannot be before expectedStart" });
        }
        const datesTouched = body.expectedStart !== undefined || body.expectedEnd !== undefined;
        const isManualSchedule = body.isManualSchedule !== undefined ? body.isManualSchedule : datesTouched ? true : existing.isManualSchedule;
        // When a summary/parent is moved, keep the hierarchy visually and
        // temporally coherent. A pure move translates the complete subtree.
        // A resize scales descendant positions inside the new parent window,
        // preserving their relative order while respecting the new boundary.
        const isParentEdit = descendants.length > 0 && datesTouched;
        const changedDescendantIds = [];
        if (isParentEdit) {
            const oldStartMs = existing.expectedStart.getTime();
            const oldEndMs = existing.expectedEnd.getTime();
            const newStartMs = nextStart.getTime();
            const newEndMs = nextEnd.getTime();
            const startChanged = newStartMs !== oldStartMs;
            const endChanged = newEndMs !== oldEndMs;
            // The grid sends both fields. If only one logical edge changed, treat
            // it as moving/resizing the parent rather than unexpectedly collapsing
            // its duration.
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
                let childStartMs;
                let childEndMs;
                if (pureMove) {
                    childStartMs = child.expectedStart.getTime() + moveDelta;
                    childEndMs = child.expectedEnd.getTime() + moveDelta;
                }
                else {
                    const startRatio = (child.expectedStart.getTime() - oldStartMs) / oldDuration;
                    const endRatio = (child.expectedEnd.getTime() - oldStartMs) / oldDuration;
                    childStartMs = newStartMs + startRatio * effectiveDuration;
                    childEndMs = newStartMs + endRatio * effectiveDuration;
                    if (childEndMs <= childStartMs)
                        childEndMs = childStartMs + DAY_MS;
                }
                await db_1.prisma.task.update({
                    where: { id: child.id },
                    data: {
                        expectedStart: new Date(Math.round(childStartMs)),
                        expectedEnd: new Date(Math.round(childEndMs)),
                        durationDays: durationDays(new Date(Math.round(childStartMs)), new Date(Math.round(childEndMs))),
                        isManualSchedule: true,
                    },
                });
                changedDescendantIds.push(child.id);
            }
        }
        const task = await db_1.prisma.task.update({
            where: { id },
            data: {
                ...body,
                expectedStart: nextStart,
                expectedEnd: nextEnd,
                durationDays: datesTouched ? durationDays(nextStart, nextEnd) : undefined,
                isManualSchedule,
            },
        });
        const results = await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, existing.projectId);
        // The recompute pass derives every summary/ancestor range from its
        // descendants. Capture the complete local change set so a PRMS
        // write-back updates the same hierarchy, not only the clicked row.
        const allAfter = await db_1.prisma.task.findMany({ where: { projectId: existing.projectId } });
        const changedIds = allAfter
            .filter(t => {
            const before = beforeById.get(t.id);
            return !!before && (before.expectedStart.getTime() !== t.expectedStart.getTime() ||
                before.expectedEnd.getTime() !== t.expectedEnd.getTime());
        })
            .map(t => t.id);
        try {
            for (const changedId of changedIds) {
                await (0, service_1.pushTaskUpdate)(changedId, req.organizationId);
            }
        }
        catch (e) {
            // Restore the entire local hierarchy if the source system rejects any
            // write. Best-effort compensating writes are attempted for any external
            // rows that were already updated.
            for (const changedId of changedIds) {
                const before = beforeById.get(changedId);
                if (!before)
                    continue;
                await db_1.prisma.task.update({
                    where: { id: changedId },
                    data: {
                        expectedStart: before.expectedStart,
                        expectedEnd: before.expectedEnd,
                        durationDays: before.durationDays,
                        isManualSchedule: before.isManualSchedule,
                    },
                }).catch(() => undefined);
                await (0, service_1.pushTaskUpdate)(changedId, req.organizationId).catch(() => undefined);
            }
            await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, existing.projectId);
            return reply.code(502).send({
                error: "The external source rejected the schedule update. The local hierarchy was rolled back.",
                code: e?.code || "CONNECTOR_WRITEBACK_FAILED",
                details: process.env.NODE_ENV === "production" ? undefined : String(e?.message || e),
            });
        }
        const refreshed = await db_1.prisma.task.findUnique({
            where: { id: task.id },
            include: { scheduleResult: true, assignments: { include: { resource: true } } },
        });
        return withComputedFields(refreshed ?? task, results);
    });
    app.delete("/tasks/:id", { preHandler: (0, auth_1.requireScope)("tasks:write") }, async (req, reply) => {
        const { id } = req.params;
        const existing = await db_1.prisma.task.findFirst({
            where: { id, project: { organizationId: req.organizationId } },
        });
        if (!existing)
            return reply.code(404).send({ error: "Task not found" });
        await db_1.prisma.task.delete({ where: { id } });
        await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, existing.projectId);
        return reply.code(204).send();
    });
    // Sets (or clears) a goal date without moving the task itself — see the
    // target_date design discussion. Returns whether the current schedule
    // actually hits it.
    app.post("/tasks/:id/target", { preHandler: (0, auth_1.requireScope)("tasks:write") }, async (req, reply) => {
        const { id } = req.params;
        const existing = await db_1.prisma.task.findFirst({
            where: { id, project: { organizationId: req.organizationId } },
        });
        if (!existing)
            return reply.code(404).send({ error: "Task not found" });
        const parsedTarget = zod_1.z.object({ targetDate: zod_1.z.coerce.date().nullable() }).safeParse(req.body);
        if (!parsedTarget.success)
            return reply.code(400).send({ error: "Invalid targetDate", code: "VALIDATION_ERROR", details: parsedTarget.error.issues });
        const { targetDate } = parsedTarget.data;
        await db_1.prisma.task.update({
            where: { id },
            data: { targetDate },
        });
        const results = await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, existing.projectId);
        const r = results.get(id);
        return {
            taskId: id,
            targetDate: targetDate ? targetDate.toISOString() : null,
            computedFinish: r.expectedEnd,
            targetFeasible: r.targetFeasible,
            slipDays: targetDate
                ? Math.max(0, Math.round((r.expectedEnd.getTime() - targetDate.getTime()) / DAY_MS))
                : null,
        };
    });
}
//# sourceMappingURL=tasks.js.map