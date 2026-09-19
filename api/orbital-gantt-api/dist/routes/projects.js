"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectRoutes = projectRoutes;
const db_1 = require("../db");
const auth_1 = require("../plugins/auth");
const schemas_1 = require("../schemas");
async function projectRoutes(app) {
    app.addHook("preHandler", auth_1.requireApiKey);
    app.post("/projects", { preHandler: (0, auth_1.requireScope)("projects:write") }, async (req, reply) => {
        const body = schemas_1.createProjectSchema.parse(req.body);
        const project = await db_1.prisma.project.create({
            data: { ...body, organizationId: req.organizationId },
        });
        return reply.code(201).send(project);
    });
    app.get("/projects", { preHandler: (0, auth_1.requireScope)("projects:read") }, async (req) => {
        return db_1.prisma.project.findMany({
            where: { organizationId: req.organizationId },
            orderBy: { createdAt: "desc" },
        });
    });
    app.get("/projects/:id", { preHandler: (0, auth_1.requireScope)("projects:read") }, async (req, reply) => {
        const { id } = req.params;
        const project = await db_1.prisma.project.findFirst({
            where: { id, organizationId: req.organizationId },
        });
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        const [taskCount, criticalCount] = await Promise.all([
            db_1.prisma.task.count({ where: { projectId: id } }),
            db_1.prisma.scheduleResult.count({ where: { isCritical: true, task: { projectId: id } } }),
        ]);
        return { ...project, taskCount, criticalTaskCount: criticalCount };
    });
    app.patch("/projects/:id", { preHandler: (0, auth_1.requireScope)("projects:write") }, async (req, reply) => {
        const { id } = req.params;
        const body = schemas_1.updateProjectSchema.parse(req.body);
        const existing = await db_1.prisma.project.findFirst({
            where: { id, organizationId: req.organizationId },
        });
        if (!existing)
            return reply.code(404).send({ error: "Project not found" });
        const project = await db_1.prisma.project.update({ where: { id }, data: body });
        return project;
    });
    app.delete("/projects/:id", { preHandler: (0, auth_1.requireScope)("projects:write") }, async (req, reply) => {
        const { id } = req.params;
        const existing = await db_1.prisma.project.findFirst({
            where: { id, organizationId: req.organizationId },
        });
        if (!existing)
            return reply.code(404).send({ error: "Project not found" });
        await db_1.prisma.project.delete({ where: { id } });
        return reply.code(204).send();
    });
}
//# sourceMappingURL=projects.js.map