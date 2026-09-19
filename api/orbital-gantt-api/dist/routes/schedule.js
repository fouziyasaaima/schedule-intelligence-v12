"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleRoutes = scheduleRoutes;
const db_1 = require("../db");
const auth_1 = require("../plugins/auth");
const recompute_1 = require("../scheduling/recompute");
const cpm_1 = require("../scheduling/cpm");
async function scheduleRoutes(app) {
    app.addHook("preHandler", auth_1.requireApiKey);
    app.get("/projects/:id/schedule/validate", { preHandler: (0, auth_1.requireScope)("schedule:read") }, async (req, reply) => {
        const { id } = req.params;
        const project = await db_1.prisma.project.findFirst({ where: { id, organizationId: req.organizationId } });
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        const tasks = await db_1.prisma.task.findMany({ where: { projectId: id }, select: { id: true, name: true, expectedStart: true } });
        const deps = await db_1.prisma.dependency.findMany({ where: { projectId: id, isActive: true } });
        const graph = (0, cpm_1.analyzeDependencyGraph)(tasks, deps.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId, dependencyType: d.dependencyType, lagDays: d.lagDays, isActive: d.isActive })));
        const names = new Map(tasks.map((t) => [t.id, t.name]));
        return { valid: graph.cycleTaskIds.length === 0, taskCount: tasks.length, dependencyCount: deps.length, cycleTaskIds: graph.cycleTaskIds, cycleTaskNames: graph.cycleTaskIds.map((id) => names.get(id) || id), cyclePathIds: graph.cyclePathIds, cyclePathNames: graph.cyclePathIds.map((id) => names.get(id) || id) };
    });
    // Force a recompute — normally unnecessary since every mutation already
    // triggers one, but useful after bulk external syncs.
    app.post("/projects/:id/schedule/recompute", { preHandler: (0, auth_1.requireScope)("schedule:write") }, async (req, reply) => {
        const { id } = req.params;
        const project = await db_1.prisma.project.findFirst({
            where: { id, organizationId: req.organizationId },
        });
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        const before = await db_1.prisma.task.findMany({ where: { projectId: id }, include: { scheduleResult: true } });
        const dependencies = await db_1.prisma.dependency.count({ where: { projectId: id, isActive: true } });
        const results = await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, id);
        const beforeById = new Map(before.map((t) => [t.id, t]));
        const changedTasks = [...results.values()].flatMap((r) => {
            const b = beforeById.get(r.id);
            if (!b)
                return [];
            const startShiftDays = Math.round((r.expectedStart.getTime() - b.expectedStart.getTime()) / 86400000);
            const finishShiftDays = Math.round((r.expectedEnd.getTime() - b.expectedEnd.getTime()) / 86400000);
            const oldSlack = b.scheduleResult?.slackDays ?? null;
            const oldCritical = b.scheduleResult?.isCritical ?? null;
            const criticalChanged = oldCritical !== r.isCritical;
            const slackChanged = oldSlack !== r.slackDays;
            const targetChanged = b.targetFeasible !== r.targetFeasible;
            if (!startShiftDays && !finishShiftDays && !criticalChanged && !slackChanged && !targetChanged)
                return [];
            return [{ taskId: r.id, taskName: b.name, startShiftDays, finishShiftDays, oldSlack, slackDays: r.slackDays, oldIsCritical: oldCritical, isCritical: r.isCritical, targetFeasible: r.targetFeasible }];
        });
        const criticalTaskCount = [...results.values()].filter((r) => r.isCritical).length;
        const movedTaskCount = changedTasks.filter((t) => t.startShiftDays !== 0 || t.finishShiftDays !== 0).length;
        const criticalChanges = changedTasks.filter((t) => t.oldIsCritical !== t.isCritical).length;
        return {
            projectId: id, taskCount: results.size, dependencyCount: dependencies, criticalTaskCount, changedTaskCount: changedTasks.length, movedTaskCount, criticalChanges, changedTasks, computedAt: new Date().toISOString(), results: Object.fromEntries(results),
        };
    });
    // Plain-language "why is this task's date what it is" — deterministic for
    // now (dependency + slack reasoning), the LLM-narrated version is Phase 4.
    app.get("/tasks/:id/explain", { preHandler: (0, auth_1.requireScope)("schedule:read") }, async (req, reply) => {
        const { id } = req.params;
        const task = await db_1.prisma.task.findFirst({
            where: { id, project: { organizationId: req.organizationId } },
            include: {
                scheduleResult: true,
                predecessorLinks: { include: { predecessor: true } },
            },
        });
        if (!task)
            return reply.code(404).send({ error: "Task not found" });
        const drivers = task.predecessorLinks
            .filter((d) => d.isActive)
            .map((d) => `${d.predecessor.name} (${d.dependencyType}, lag ${d.lagDays}d)`);
        const reasoning = task.isManualSchedule
            ? "This task's dates are manually pinned and are not derived from dependencies."
            : drivers.length
                ? `Driven by: ${drivers.join(", ")}.`
                : "No active predecessors — date is a free-standing anchor.";
        return {
            taskId: id,
            expectedStart: task.expectedStart,
            expectedEnd: task.expectedEnd,
            isCritical: task.scheduleResult?.isCritical ?? null,
            slackDays: task.scheduleResult?.slackDays ?? null,
            reasoning,
        };
    });
}
//# sourceMappingURL=schedule.js.map