"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyRoutes = historyRoutes;
const db_1 = require("../db");
const auth_1 = require("../plugins/auth");
async function historyRoutes(app) {
    app.addHook("preHandler", auth_1.requireApiKey);
    app.get("/projects/:id/history", { preHandler: (0, auth_1.requireScope)("projects:read") }, async (req, reply) => {
        const { id } = req.params;
        const project = await db_1.prisma.project.findFirst({ where: { id, organizationId: req.organizationId } });
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        return db_1.prisma.scheduleSnapshot.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, label: true, createdAt: true } });
    });
    app.post("/projects/:id/history/snapshots", { preHandler: (0, auth_1.requireScope)("projects:write") }, async (req, reply) => {
        const { id } = req.params;
        const body = (req.body || {});
        const project = await db_1.prisma.project.findFirst({ where: { id, organizationId: req.organizationId } });
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        const tasks = await db_1.prisma.task.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" } });
        const snapshot = await db_1.prisma.scheduleSnapshot.create({ data: { projectId: id, label: body.label?.trim() || `Snapshot ${new Date().toISOString()}`, taskStateJson: tasks.map(t => ({ id: t.id, name: t.name, expectedStart: t.expectedStart, expectedEnd: t.expectedEnd, durationDays: t.durationDays, progressPct: t.progressPct, status: t.status, isManualSchedule: t.isManualSchedule })) } });
        return reply.code(201).send({ id: snapshot.id, label: snapshot.label, createdAt: snapshot.createdAt });
    });
    app.get("/projects/:id/history/:snapshotId", { preHandler: (0, auth_1.requireScope)("projects:read") }, async (req, reply) => {
        const { id, snapshotId } = req.params;
        const snapshot = await db_1.prisma.scheduleSnapshot.findFirst({ where: { id: snapshotId, projectId: id, project: { organizationId: req.organizationId } } });
        if (!snapshot)
            return reply.code(404).send({ error: "Snapshot not found" });
        return snapshot;
    });
}
//# sourceMappingURL=history.js.map