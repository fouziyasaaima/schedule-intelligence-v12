import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { requireApiKey, requireScope } from "../plugins/auth";
import { createProjectSchema, updateProjectSchema } from "../schemas";

export async function projectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireApiKey);

  app.post("/projects", { preHandler: requireScope("projects:write") }, async (req, reply) => {
    const body = createProjectSchema.parse(req.body);
    const project = await prisma.project.create({
      data: { ...body, organizationId: req.organizationId! },
    });
    return reply.code(201).send(project);
  });

  app.get("/projects", { preHandler: requireScope("projects:read") }, async (req) => {
    return prisma.project.findMany({
      where: { organizationId: req.organizationId! },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get("/projects/:id", { preHandler: requireScope("projects:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({
      where: { id, organizationId: req.organizationId! },
    });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const [taskCount, criticalCount] = await Promise.all([
      prisma.task.count({ where: { projectId: id } }),
      prisma.scheduleResult.count({ where: { isCritical: true, task: { projectId: id } } }),
    ]);

    return { ...project, taskCount, criticalTaskCount: criticalCount };
  });

  app.patch("/projects/:id", { preHandler: requireScope("projects:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateProjectSchema.parse(req.body);
    const existing = await prisma.project.findFirst({
      where: { id, organizationId: req.organizationId! },
    });
    if (!existing) return reply.code(404).send({ error: "Project not found" });

    const project = await prisma.project.update({ where: { id }, data: body });
    return project;
  });

  app.delete("/projects/:id", { preHandler: requireScope("projects:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.project.findFirst({
      where: { id, organizationId: req.organizationId! },
    });
    if (!existing) return reply.code(404).send({ error: "Project not found" });

    await prisma.project.delete({ where: { id } });
    return reply.code(204).send();
  });
}
