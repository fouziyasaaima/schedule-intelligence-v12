"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resourceRoutes = resourceRoutes;
const db_1 = require("../db");
const auth_1 = require("../plugins/auth");
const schemas_1 = require("../schemas");
async function resourceRoutes(app) {
    app.addHook("preHandler", auth_1.requireApiKey);
    // --- Resources: name, role, capacity only. No profiles, no chat, no CRM. ---
    app.post("/resources", { preHandler: (0, auth_1.requireScope)("resources:write") }, async (req, reply) => {
        const body = schemas_1.createResourceSchema.parse(req.body);
        const { projectId, ...resourceBody } = body;
        if (projectId) {
            const project = await db_1.prisma.project.findFirst({ where: { id: projectId, organizationId: req.organizationId }, select: { id: true } });
            if (!project)
                return reply.code(400).send({ error: "Project not found" });
        }
        const resource = await db_1.prisma.resource.create({ data: { ...resourceBody, organizationId: req.organizationId } });
        if (projectId)
            await db_1.prisma.projectResource.create({ data: { projectId, resourceId: resource.id } });
        return reply.code(201).send(resource);
    });
    // Project-scoped resource view: only resources actually assigned to tasks in the selected project.
    // This keeps Resource Orbit project-specific instead of exposing the whole organization roster.
    app.get("/projects/:id/resources", { preHandler: (0, auth_1.requireScope)("resources:read") }, async (req, reply) => {
        const { id } = req.params;
        const project = await db_1.prisma.project.findFirst({ where: { id, organizationId: req.organizationId }, select: { id: true } });
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        // If the project came from a connector (for example PRMS), keep the Orbit
        // resource roster on the same connector. This prevents unrelated
        // organization-wide resources from leaking into a project view.
        const projectIdentity = await db_1.prisma.connectorIdentity.findFirst({
            where: { entityType: "project", internalId: id, connector: { organizationId: req.organizationId } },
            select: { connectorId: true },
        });
        // Project membership is the source of truth for Resource Orbit.
        // Imported PRMS resources are included through their task assignments / project links,
        // while resources created locally from the Add Resource form are included through the
        // projectLinks row created with projectId. Do not apply a connector-wide resource filter
        // here: that filter used to hide newly-created local resources from connector-backed projects.
        const resources = await db_1.prisma.resource.findMany({
            where: {
                organizationId: req.organizationId,
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
        const identities = await db_1.prisma.connectorIdentity.findMany({
            where: { entityType: "resource", internalId: { in: resources.map(r => r.id) }, connector: { organizationId: req.organizationId } },
            include: { connector: { select: { provider: true } } },
        });
        const identityByResource = new Map();
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
    app.get("/resources", { preHandler: (0, auth_1.requireScope)("resources:read") }, async (req) => {
        const resources = await db_1.prisma.resource.findMany({ where: { organizationId: req.organizationId } });
        const ids = await db_1.prisma.connectorIdentity.findMany({ where: { entityType: "resource", internalId: { in: resources.map(r => r.id) }, connector: { organizationId: req.organizationId } }, include: { connector: { select: { provider: true } } } });
        const identityByResource = new Map();
        for (const i of ids)
            if (!identityByResource.has(i.internalId))
                identityByResource.set(i.internalId, { externalId: i.externalId.replace(/^MEMBER:/, ""), provider: i.connector.provider });
        return resources.map(r => ({ ...r, externalId: identityByResource.get(r.id)?.externalId ?? null, source: identityByResource.get(r.id)?.provider ?? null }));
    });
    app.patch("/resources/:id", { preHandler: (0, auth_1.requireScope)("resources:write") }, async (req, reply) => {
        const { id } = req.params;
        const existing = await db_1.prisma.resource.findFirst({ where: { id, organizationId: req.organizationId } });
        if (!existing)
            return reply.code(404).send({ error: "Resource not found" });
        const body = schemas_1.updateResourceSchema.parse(req.body);
        const updated = await db_1.prisma.resource.update({ where: { id }, data: body });
        return updated;
    });
    app.delete("/resources/:id", { preHandler: (0, auth_1.requireScope)("resources:write") }, async (req, reply) => {
        const { id } = req.params;
        const existing = await db_1.prisma.resource.findFirst({
            where: { id, organizationId: req.organizationId },
        });
        if (!existing)
            return reply.code(404).send({ error: "Resource not found" });
        await db_1.prisma.resource.delete({ where: { id } });
        return reply.code(204).send();
    });
    // --- Assignments: resource <-> task allocation ---
    app.post("/tasks/:taskId/assignments", { preHandler: (0, auth_1.requireScope)("resources:write") }, async (req, reply) => {
        const { taskId } = req.params;
        const task = await db_1.prisma.task.findFirst({
            where: { id: taskId, project: { organizationId: req.organizationId } },
        });
        if (!task)
            return reply.code(404).send({ error: "Task not found" });
        const body = schemas_1.createAssignmentSchema.parse(req.body);
        const resource = await db_1.prisma.resource.findFirst({
            where: { id: body.resourceId, organizationId: req.organizationId },
        });
        if (!resource)
            return reply.code(400).send({ error: "Resource not found" });
        const units = body.units ?? 1;
        const allocationPct = body.allocationPct ?? Math.max(1, Math.min(100, Math.round((units / Math.max(resource.capacityUnits, 0.0001)) * 100)));
        const assignment = await db_1.prisma.assignment.upsert({
            where: { taskId_resourceId: { taskId, resourceId: body.resourceId } },
            create: { taskId, resourceId: body.resourceId, allocationPct, units, role: body.role },
            update: { allocationPct, units, role: body.role },
        });
        return reply.code(201).send(assignment);
    });
    app.delete("/assignments/:id", { preHandler: (0, auth_1.requireScope)("resources:write") }, async (req, reply) => {
        const { id } = req.params;
        const existing = await db_1.prisma.assignment.findFirst({
            where: { id, task: { project: { organizationId: req.organizationId } } },
        });
        if (!existing)
            return reply.code(404).send({ error: "Assignment not found" });
        await db_1.prisma.assignment.delete({ where: { id } });
        return reply.code(204).send();
    });
    // Simple workload view: allocated hours/day per resource vs. capacity.
    // Full auto-leveling (Phase 5 differentiator) builds on top of this.
    app.get("/resources/:id/workload", { preHandler: (0, auth_1.requireScope)("resources:read") }, async (req, reply) => {
        const { id } = req.params;
        const resource = await db_1.prisma.resource.findFirst({
            where: { id, organizationId: req.organizationId },
            include: { assignments: { include: { task: true } } },
        });
        if (!resource)
            return reply.code(404).send({ error: "Resource not found" });
        const items = resource.assignments.map((a) => ({
            assignmentId: a.id, taskId: a.taskId, taskName: a.task.name, role: a.role ?? null,
            start: a.task.expectedStart, end: a.task.expectedEnd,
            allocationPct: a.allocationPct,
            allocatedHoursPerDay: (resource.capacityHoursPerDay * a.allocationPct * (resource.availabilityPct / 100)) / 100,
        }));
        const events = items.flatMap((x) => [
            { at: x.start.getTime(), delta: x.allocationPct },
            { at: x.end.getTime(), delta: -x.allocationPct },
        ]).sort((a, b) => a.at - b.at || b.delta - a.delta);
        let active = 0, peak = 0, peakAt = null;
        for (const e of events) {
            active += e.delta;
            if (active > peak) {
                peak = active;
                peakAt = e.at;
            }
        }
        return { resourceId: id, capacityHoursPerDay: resource.capacityHoursPerDay, capacityUnits: resource.capacityUnits, unitLabel: resource.unitLabel, availabilityPct: resource.availabilityPct, peakAllocationPct: Math.round(peak * 10) / 10, peakAllocatedHoursPerDay: Math.round(resource.capacityHoursPerDay * peak / 100 * 10) / 10, overloaded: peak > (resource.availabilityPct || 100), peakAt: peakAt === null ? null : new Date(peakAt).toISOString(), assignments: items };
    });
}
//# sourceMappingURL=resources.js.map