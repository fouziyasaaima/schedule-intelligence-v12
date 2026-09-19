"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRoutes = aiRoutes;
const auth_1 = require("../plugins/auth");
const mac_service_1 = require("../mac-service");
const db_1 = require("../db");
const recompute_1 = require("../scheduling/recompute");
async function aiRoutes(app) {
    app.addHook("preHandler", auth_1.requireApiKey);
    app.get("/mac/status", { preHandler: (0, auth_1.requireScope)("forecast:read") }, async (req) => (0, mac_service_1.macStatus)(req.organizationId));
    app.patch("/mac/settings", { preHandler: (0, auth_1.requireScope)("projects:write") }, async (req) => (0, mac_service_1.saveMacSettings)(req.organizationId, req.body || {}));
    app.get("/projects/:id/ai/status", { preHandler: (0, auth_1.requireScope)("forecast:read") }, async (req) => (0, mac_service_1.macStatus)(req.organizationId));
    app.post("/projects/:id/ai/brief", { preHandler: (0, auth_1.requireScope)("forecast:read") }, async (req) => {
        const { id } = req.params;
        const body = (req.body || {});
        return (0, mac_service_1.generateMac)(id, req.organizationId, body.question?.trim() || undefined);
    });
    app.get("/projects/:id/ai/alerts", { preHandler: (0, auth_1.requireScope)("forecast:read") }, async (req) => {
        const { id } = req.params;
        return (0, mac_service_1.macAlerts)(id, req.organizationId);
    });
    app.get("/projects/:id/ai/schedule/runs", { preHandler: (0, auth_1.requireScope)("forecast:read") }, async (req) => {
        const { id } = req.params;
        return (0, mac_service_1.macScheduleRuns)(id, req.organizationId);
    });
    app.post("/projects/:id/ai/schedule", { preHandler: (0, auth_1.requireScope)("projects:write") }, async (req, reply) => {
        const { id } = req.params;
        const body = (req.body || {});
        const mode = body.mode || "recommend";
        if (!["analyze", "recommend", "autonomous"].includes(mode))
            return reply.code(400).send({ error: "Invalid MAC schedule mode", code: "MAC_SCHEDULE_MODE_INVALID" });
        return (0, mac_service_1.runMacSchedulePlanner)(id, req.organizationId, mode, body.instruction?.trim());
    });
    app.post("/projects/:id/ai/schedule/:runId/apply", { preHandler: (0, auth_1.requireScope)("projects:write") }, async (req, reply) => { const { id, runId } = req.params; return (0, mac_service_1.applyMacScheduleRun)(id, req.organizationId, runId); });
    app.post("/projects/:id/ai/schedule/:runId/rollback", { preHandler: (0, auth_1.requireScope)("projects:write") }, async (req, reply) => {
        const { id, runId } = req.params;
        const run = await db_1.prisma.aiScheduleRun.findFirst({ where: { id: runId, projectId: id, organizationId: req.organizationId, status: "APPLIED" } });
        if (!run)
            return reply.code(404).send({ error: "Applied MAC schedule run not found", code: "MAC_SCHEDULE_RUN_NOT_FOUND" });
        const latest = await db_1.prisma.aiScheduleRun.findFirst({ where: { projectId: id, organizationId: req.organizationId, status: "APPLIED" }, orderBy: { createdAt: "desc" } });
        if (latest?.id !== run.id)
            return reply.code(409).send({ error: "Rollback is limited to the latest applied MAC schedule run to protect newer work.", code: "MAC_ROLLBACK_LATEST_ONLY" });
        const changes = run.changes || {};
        const baseline = changes.baseline || {};
        for (const d of Array.isArray(changes.appliedDependencyIds) ? changes.appliedDependencyIds : [])
            await db_1.prisma.dependency.delete({ where: { id: d } }).catch(() => undefined);
        const baselineTasks = Array.isArray(baseline.tasks) ? baseline.tasks : [];
        const touchedTaskIds = new Set([...baselineTasks.map((t) => t.id), ...(Array.isArray(changes.resourceAssignments) ? changes.resourceAssignments.map((a) => a.taskId) : [])]);
        if (touchedTaskIds.size) {
            await db_1.prisma.assignment.deleteMany({ where: { taskId: { in: [...touchedTaskIds] }, task: { project: { organizationId: req.organizationId } } } });
        }
        for (const a of Array.isArray(baseline.assignments) ? baseline.assignments : [])
            await db_1.prisma.assignment.create({ data: { taskId: a.taskId, resourceId: a.resourceId, allocationPct: a.allocationPct, role: a.role || null } }).catch(() => undefined);
        for (const t of baselineTasks)
            await db_1.prisma.task.update({ where: { id: t.id }, data: { expectedStart: new Date(t.expectedStart), expectedEnd: new Date(t.expectedEnd), isManualSchedule: Boolean(t.isManualSchedule) } }).catch(() => undefined);
        await (0, recompute_1.recomputeProjectSchedule)(db_1.prisma, id);
        await db_1.prisma.aiScheduleRun.update({ where: { id: run.id }, data: { status: "ROLLED_BACK" } });
        return { ok: true, runId: run.id, status: "ROLLED_BACK", projectId: id };
    });
}
//# sourceMappingURL=ai.js.map