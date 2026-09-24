"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importRoutes = importRoutes;
const db_1 = require("../db");
const auth_1 = require("../plugins/auth");
const zod_1 = require("zod");
const taskSchema = zod_1.z.object({
    externalId: zod_1.z.string().optional(), wbs: zod_1.z.string().optional(), name: zod_1.z.string().min(1).max(500), description: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(), procedure: zod_1.z.string().optional(), notes: zod_1.z.string().optional(), status: zod_1.z.string().optional(),
    start: zod_1.z.coerce.date(), end: zod_1.z.coerce.date(), durationHours: zod_1.z.number().nonnegative().optional(), parentExternalId: zod_1.z.string().optional(),
    ownerName: zod_1.z.string().optional(), resourceNames: zod_1.z.array(zod_1.z.string()).default([]), customFields: zod_1.z.record(zod_1.z.any()).default({}),
    taskType: zod_1.z.enum(["SUMMARY", "TASK", "MILESTONE"]).optional(), progressPct: zod_1.z.number().int().min(0).max(100).optional(),
});
const resourceSchema = zod_1.z.object({
    externalId: zod_1.z.string().optional(), name: zod_1.z.string().min(1).max(180), type: zod_1.z.enum(["PERSON", "EQUIPMENT", "FACILITY", "VEHICLE", "MATERIAL", "TEAM", "OTHER"]).default("OTHER"),
    role: zod_1.z.string().optional(), capacityHoursPerDay: zod_1.z.number().positive().max(24).optional(), capacityUnits: zod_1.z.number().positive().max(100000).optional(), unitLabel: zod_1.z.string().max(40).optional(),
    availabilityPct: zod_1.z.number().min(0).max(100).optional(), active: zod_1.z.boolean().optional(), owner: zod_1.z.string().optional(), status: zod_1.z.string().optional(), notes: zod_1.z.string().optional(), customFields: zod_1.z.record(zod_1.z.any()).default({}),
});
const dependencySchema = zod_1.z.object({
    predecessorExternalId: zod_1.z.string().min(1),
    successorExternalId: zod_1.z.string().min(1),
    dependencyType: zod_1.z.preprocess((value) => {
        const v = String(value ?? "").trim().toUpperCase().replace(/[ -]/g, "_");
        const map = {
            FS: "FINISH_TO_START",
            SS: "START_TO_START",
            FF: "FINISH_TO_FINISH",
            SF: "START_TO_FINISH",
            FINISH_START: "FINISH_TO_START",
            START_START: "START_TO_START",
            FINISH_FINISH: "FINISH_TO_FINISH",
            START_FINISH: "START_TO_FINISH",
        };
        return map[v] || v || "FINISH_TO_START";
    }, zod_1.z.enum(["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"])).default("FINISH_TO_START"),
    lagDays: zod_1.z.number().int().default(0)
});
const assignmentSchema = zod_1.z.object({ taskExternalId: zod_1.z.string().min(1), resourceExternalId: zod_1.z.string().min(1), assignmentType: zod_1.z.string().optional(), allocationPct: zod_1.z.number().int().min(1).max(100).default(100), units: zod_1.z.number().positive().default(1), role: zod_1.z.string().optional() });
const importSchema = zod_1.z.object({ projectId: zod_1.z.string().min(1), sourceName: zod_1.z.string().max(300).optional(), mode: zod_1.z.enum(["APPEND", "UPSERT"]).default("UPSERT"), tasks: zod_1.z.array(taskSchema).max(10000), resources: zod_1.z.array(resourceSchema).max(5000).default([]), dependencies: zod_1.z.array(dependencySchema).max(20000).default([]), assignments: zod_1.z.array(assignmentSchema).max(20000).default([]) });
const normalize = (value) => value.trim().toLowerCase().replace(/\s+/g, " ");
const splitResourceText = (value) => String(value || "").split(/[;\n,]+/).map(normalize).filter(Boolean);
async function ensureSISFConnector(tx, organizationId) {
    const existing = await tx.connector.findFirst({ where: { organizationId, provider: "sisf" } });
    if (existing)
        return existing;
    return tx.connector.create({ data: { organizationId, name: "Schedule Intelligence Standard Format", provider: "sisf", baseUrl: "sisf://local", authType: "NONE", status: "CONNECTED", direction: "BIDIRECTIONAL", config: { schema: "SISF", version: "1.0" } } });
}
async function importRoutes(app) {
    app.addHook("preHandler", auth_1.requireApiKey);
    app.post("/projects/:projectId/import", { preHandler: (0, auth_1.requireScope)("tasks:write") }, async (req, reply) => {
        const projectId = String(req.params.projectId || "");
        const body = importSchema.parse({ ...req.body, projectId });
        const project = await db_1.prisma.project.findFirst({ where: { id: projectId, organizationId: req.organizationId }, select: { id: true, name: true } });
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        const result = await db_1.prisma.$transaction(async (tx) => {
            const sisf = await ensureSISFConnector(tx, req.organizationId);
            const resourceByKey = new Map();
            const resourceByExternal = new Map();
            const existingResources = await tx.resource.findMany({ where: { organizationId: req.organizationId } });
            for (const r of existingResources)
                resourceByKey.set(normalize(r.name), r);
            const resourceIdentities = await tx.connectorIdentity.findMany({ where: { connectorId: sisf.id, entityType: "resource" } });
            for (const i of resourceIdentities)
                resourceByExternal.set(i.externalId, i.internalId);
            const resourcesCreated = [], resourcesUpdated = [];
            for (const item of body.resources) {
                const key = normalize(item.name);
                let existing = item.externalId ? await tx.connectorIdentity.findUnique({ where: { connectorId_entityType_externalId: { connectorId: sisf.id, entityType: "resource", externalId: item.externalId } } }).then((i) => i ? existingResources.find(r => r.id === i.internalId) : null) : null;
                if (!existing)
                    existing = resourceByKey.get(key);
                const data = { role: item.role, type: item.type, capacityHoursPerDay: item.capacityHoursPerDay ?? 8, capacityUnits: item.capacityUnits ?? 1, unitLabel: item.unitLabel ?? "unit", availabilityPct: item.availabilityPct ?? 100, isActive: item.active ?? true, customFields: item.customFields ?? {} };
                const resource = existing && body.mode === "UPSERT" ? await tx.resource.update({ where: { id: existing.id }, data }) : existing ? existing : await tx.resource.create({ data: { organizationId: req.organizationId, name: item.name, ...data } });
                if (existing && body.mode === "UPSERT")
                    resourcesUpdated.push(resource);
                else if (!existing)
                    resourcesCreated.push(resource);
                await tx.projectResource.upsert({ where: { projectId_resourceId: { projectId, resourceId: resource.id } }, create: { projectId, resourceId: resource.id }, update: { active: true } });
                if (item.externalId)
                    await tx.connectorIdentity.upsert({ where: { connectorId_entityType_externalId: { connectorId: sisf.id, entityType: "resource", externalId: item.externalId } }, create: { connectorId: sisf.id, entityType: "resource", externalId: item.externalId, internalId: resource.id }, update: { internalId: resource.id } });
                resourceByKey.set(key, resource);
                if (item.externalId)
                    resourceByExternal.set(item.externalId, resource.id);
            }
            for (const task of body.tasks) {
                const owner = normalize(task.ownerName || "");
                if (!owner || resourceByKey.has(owner))
                    continue;
                const created = await tx.resource.create({ data: { organizationId: req.organizationId, name: task.ownerName.trim(), type: "PERSON", capacityHoursPerDay: 8, capacityUnits: 1, unitLabel: "person", availabilityPct: 100, customFields: {} } });
                await tx.projectResource.create({ data: { projectId, resourceId: created.id } });
                resourceByKey.set(owner, created);
                resourcesCreated.push(created);
            }
            const taskByExternal = new Map();
            const taskByWbs = new Map();
            const sisfTaskIds = await tx.connectorIdentity.findMany({ where: { connectorId: sisf.id, entityType: "task" } });
            for (const i of sisfTaskIds) {
                const t = await tx.task.findUnique({ where: { id: i.internalId } });
                if (t?.projectId === projectId)
                    taskByExternal.set(i.externalId, t);
            }
            const existingTasks = await tx.task.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } });
            for (const t of existingTasks)
                taskByExternal.set(`name:${normalize(t.name)}`, t);
            const createdTasks = [], updatedTasks = [], pendingParents = [];
            for (let i = 0; i < body.tasks.length; i++) {
                const item = body.tasks[i];
                const start = new Date(item.start), end = new Date(item.end);
                if (end < start)
                    throw Object.assign(new Error(`Task '${item.name}' has an end date before its start date.`), { statusCode: 400 });
                let existing = null;
                if (item.externalId)
                    existing = taskByExternal.get(item.externalId);
                if (!existing && body.mode === "UPSERT")
                    existing = taskByExternal.get(`name:${normalize(item.name)}`);
                const status = ["ACTIVE", "ON_HOLD", "CLOSED", "DELAYED"].includes(String(item.status || "").toUpperCase()) ? String(item.status).toUpperCase() : "ACTIVE";
                const data = { name: item.name, description: [item.category, item.procedure, item.notes, item.description].filter(Boolean).join("\n"), expectedStart: start, expectedEnd: end, durationDays: Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000)), status, progressPct: item.progressPct ?? 0, isManualSchedule: true, sortOrder: i, taskType: item.taskType || "TASK", customFields: item.customFields || {} };
                const t = existing && body.mode === "UPSERT" ? await tx.task.update({ where: { id: existing.id }, data }) : existing ? existing : await tx.task.create({ data: { ...data, projectId } });
                if (existing && body.mode === "UPSERT")
                    updatedTasks.push(t);
                else if (!existing)
                    createdTasks.push(t);
                if (item.externalId) {
                    await tx.connectorIdentity.upsert({ where: { connectorId_entityType_externalId: { connectorId: sisf.id, entityType: "task", externalId: item.externalId } }, create: { connectorId: sisf.id, entityType: "task", externalId: item.externalId, internalId: t.id }, update: { internalId: t.id } });
                    taskByExternal.set(item.externalId, t);
                }
                if (item.wbs)
                    taskByWbs.set(normalize(item.wbs), t);
                taskByExternal.set(`name:${normalize(item.name)}`, t);
                if (item.parentExternalId)
                    pendingParents.push({ taskId: t.id, parentKey: normalize(item.parentExternalId) });
                const names = new Set([...item.resourceNames, ...(item.ownerName ? [item.ownerName] : [])].flatMap(splitResourceText));
                for (const name of names) {
                    const r = resourceByKey.get(name);
                    if (r)
                        await tx.assignment.upsert({ where: { taskId_resourceId: { taskId: t.id, resourceId: r.id } }, create: { taskId: t.id, resourceId: r.id, allocationPct: 100, units: 1 }, update: {} });
                }
            }
            for (const p of pendingParents) {
                const parent = taskByExternal.get(p.parentKey) || taskByWbs.get(p.parentKey) || taskByExternal.get(`name:${p.parentKey}`);
                if (parent && parent.id !== p.taskId)
                    await tx.task.update({ where: { id: p.taskId }, data: { parentId: parent.id } });
            }
            for (const d of body.dependencies) {
                const pre = taskByExternal.get(d.predecessorExternalId) || taskByWbs.get(normalize(d.predecessorExternalId));
                const suc = taskByExternal.get(d.successorExternalId) || taskByWbs.get(normalize(d.successorExternalId));
                if (!pre || !suc || pre.id === suc.id)
                    continue;
                await tx.dependency.upsert({ where: { projectId_predecessorId_successorId: { projectId, predecessorId: pre.id, successorId: suc.id } }, create: { projectId, predecessorId: pre.id, successorId: suc.id, dependencyType: d.dependencyType, lagDays: d.lagDays }, update: { dependencyType: d.dependencyType, lagDays: d.lagDays, isActive: true } });
            }
            for (const a of body.assignments) {
                const t = taskByExternal.get(a.taskExternalId) || taskByWbs.get(normalize(a.taskExternalId));
                const rid = resourceByExternal.get(a.resourceExternalId);
                if (!t || !rid)
                    continue;
                await tx.assignment.upsert({ where: { taskId_resourceId: { taskId: t.id, resourceId: rid } }, create: { taskId: t.id, resourceId: rid, allocationPct: a.allocationPct, units: a.units, role: a.role }, update: { allocationPct: a.allocationPct, units: a.units, role: a.role } });
            }
            const finalTasks = await tx.task.findMany({ where: { projectId }, select: { id: true, parentId: true, taskType: true } });
            const parentIds = new Set(finalTasks.filter(t => t.parentId).map(t => t.parentId));
            for (const t of finalTasks)
                if (parentIds.has(t.id) && t.taskType !== "SUMMARY")
                    await tx.task.update({ where: { id: t.id }, data: { taskType: "SUMMARY" } });
            return { projectId, projectName: project.name, tasksCreated: createdTasks.length, tasksUpdated: updatedTasks.length, resourcesCreated: resourcesCreated.length, resourcesUpdated: resourcesUpdated.length, taskCount: body.tasks.length, resourceCount: body.resources.length, dependencyCount: body.dependencies.length, assignmentCount: body.assignments.length, schema: "SISF", schemaVersion: "1.0" };
        });
        return reply.code(200).send({ success: true, ...result, message: `Imported ${result.tasksCreated + result.tasksUpdated} tasks, ${result.resourcesCreated + result.resourcesUpdated} resources, ${result.dependencyCount} dependencies and ${result.assignmentCount} assignments.` });
    });
}
//# sourceMappingURL=imports.js.map