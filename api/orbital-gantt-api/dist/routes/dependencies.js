"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dependencyRoutes = dependencyRoutes;
const db_1 = require("../db");
const auth_1 = require("../plugins/auth");
const schemas_1 = require("../schemas");
const recompute_1 = require("../scheduling/recompute");
async function assertProjectOwned(orgId, projectId) {
    return db_1.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
}
async function dependencyRoutes(app) {
    app.addHook("preHandler", auth_1.requireApiKey);
    app.post("/projects/:projectId/dependencies", { preHandler: (0, auth_1.requireScope)("dependencies:write") }, async (req, reply) => {
        const { projectId } = req.params;
        const project = await assertProjectOwned(req.organizationId, projectId);
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        const body = schemas_1.createDependencySchema.parse(req.body);
        if (body.predecessorId === body.successorId) {
            return reply.code(400).send({ error: "A task cannot depend on itself" });
        }
        const [pred, succ] = await Promise.all([
            db_1.prisma.task.findFirst({ where: { id: body.predecessorId, projectId } }),
            db_1.prisma.task.findFirst({ where: { id: body.successorId, projectId } }),
        ]);
        if (!pred || !succ) {
            return reply.code(400).send({ error: "Both tasks must belong to this project" });
        }
        const duplicate = await db_1.prisma.dependency.findFirst({
            where: { projectId, predecessorId: body.predecessorId, successorId: body.successorId, isActive: true },
        });
        if (duplicate) {
            return reply.code(409).send({
                error: "DEPENDENCY_ALREADY_EXISTS",
                message: "A dependency already exists between these two tasks. Edit its relationship or lag instead of creating a duplicate.",
                existingDependencyId: duplicate.id,
                existingDependencyType: duplicate.dependencyType,
                existingLagDays: duplicate.lagDays,
            });
        }
        // Create then immediately validate the complete graph. If recomputation detects
        // a cycle, roll the edge back so an invalid dependency can never be persisted.
        // Linking a successor makes its schedule dependency-driven. The predecessor
        // remains an anchor, while the successor can now move when constraints change.
        const before = await db_1.prisma.task.findMany({ where: { projectId }, include: { scheduleResult: true } });
        const dependency = await db_1.prisma.dependency.create({ data: { projectId, ...body } });
        const successorWasManual = succ.isManualSchedule;
        try {
            if (successorWasManual) {
                await db_1.prisma.task.update({ where: { id: succ.id }, data: { isManualSchedule: false } });
            }
            const results = await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, projectId);
            const beforeById = new Map(before.map((t) => [t.id, t]));
            const changedTasks = [...results.values()].flatMap((r) => {
                const b = beforeById.get(r.id);
                if (!b)
                    return [];
                const startShiftDays = Math.round((r.expectedStart.getTime() - b.expectedStart.getTime()) / 86400000);
                const finishShiftDays = Math.round((r.expectedEnd.getTime() - b.expectedEnd.getTime()) / 86400000);
                const oldSlack = b.scheduleResult?.slackDays ?? null;
                const oldIsCritical = b.scheduleResult?.isCritical ?? null;
                const criticalChanged = oldIsCritical !== r.isCritical;
                const slackChanged = oldSlack !== r.slackDays;
                if (!startShiftDays && !finishShiftDays && !criticalChanged && !slackChanged)
                    return [];
                return { taskId: r.id, taskName: b.name, startShiftDays, finishShiftDays, oldSlack, slackDays: r.slackDays, oldIsCritical, isCritical: r.isCritical };
            });
            return reply.code(201).send({
                dependency,
                schedule: {
                    taskCount: results.size,
                    criticalTaskCount: [...results.values()].filter((r) => r.isCritical).length,
                    changedTaskCount: changedTasks.length,
                    movedTaskCount: changedTasks.filter((t) => t.startShiftDays || t.finishShiftDays).length,
                    changedTasks,
                    computedAt: new Date().toISOString(),
                },
            });
        }
        catch (error) {
            await db_1.prisma.dependency.delete({ where: { id: dependency.id } }).catch(() => undefined);
            if (successorWasManual)
                await db_1.prisma.task.update({ where: { id: succ.id }, data: { isManualSchedule: true } }).catch(() => undefined);
            const err = error;
            if (err?.code === "SCHEDULE_CYCLE") {
                const ids = Array.isArray(err.cyclePathIds) && err.cyclePathIds.length ? err.cyclePathIds : (err.cycleTaskIds || []);
                const cycleTasks = ids.length ? await db_1.prisma.task.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, name: true } }) : [];
                const names = ids.map((id) => cycleTasks.find(t => t.id === id)?.name || id);
                err.message = `This link would create a scheduling cycle${names.length ? `: ${names.join(" → ")}` : ". Choose a different predecessor or successor."}`;
            }
            throw error;
        }
    });
    app.get("/projects/:projectId/dependencies", { preHandler: (0, auth_1.requireScope)("dependencies:read") }, async (req, reply) => {
        const { projectId } = req.params;
        const project = await assertProjectOwned(req.organizationId, projectId);
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        return db_1.prisma.dependency.findMany({ where: { projectId, isActive: true } });
    });
    app.patch("/dependencies/:id", { preHandler: (0, auth_1.requireScope)("dependencies:write") }, async (req, reply) => {
        const { id } = req.params;
        const existing = await db_1.prisma.dependency.findFirst({
            where: { id, project: { organizationId: req.organizationId } },
        });
        if (!existing)
            return reply.code(404).send({ error: "Dependency not found" });
        const parsed = schemas_1.createDependencySchema.partial().safeParse(req.body);
        if (!parsed.success)
            return reply.code(400).send({ error: "Invalid dependency", details: parsed.error.issues });
        const next = {
            dependencyType: parsed.data.dependencyType ?? existing.dependencyType,
            lagDays: parsed.data.lagDays ?? existing.lagDays,
        };
        const updated = await db_1.prisma.dependency.update({ where: { id }, data: next });
        try {
            await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, existing.projectId);
            return updated;
        }
        catch (error) {
            await db_1.prisma.dependency.update({ where: { id }, data: { dependencyType: existing.dependencyType, lagDays: existing.lagDays } });
            await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, existing.projectId).catch(() => undefined);
            throw error;
        }
    });
    app.delete("/dependencies/:id", { preHandler: (0, auth_1.requireScope)("dependencies:write") }, async (req, reply) => {
        const { id } = req.params;
        const existing = await db_1.prisma.dependency.findFirst({
            where: { id, project: { organizationId: req.organizationId } },
        });
        if (!existing)
            return reply.code(404).send({ error: "Dependency not found" });
        await db_1.prisma.dependency.delete({ where: { id } });
        await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, existing.projectId);
        return reply.code(204).send();
    });
}
//# sourceMappingURL=dependencies.js.map