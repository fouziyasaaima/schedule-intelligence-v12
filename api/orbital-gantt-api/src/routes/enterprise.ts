import { FastifyInstance } from "fastify";
import { createEmbedToken, requireApiKey, requireScope } from "../plugins/auth";
import { prisma } from "../db";
import { recomputeProjectSchedule } from "../scheduling/recompute";
import { analyzeDependencyGraph } from "../scheduling/cpm";
import { z } from "zod";
import { ensurePrmsProjectSynchronized } from "../connectors/service";

const proposalChangeSchema = z.object({
  taskId: z.string().min(1),
  expectedStart: z.coerce.date().optional(),
  expectedEnd: z.coerce.date().optional(),
  durationDays: z.number().int().min(1).optional(),
}).superRefine((v, ctx) => {
  if (v.expectedStart && v.expectedEnd && v.expectedEnd < v.expectedStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedEnd"], message: "expectedEnd cannot be before expectedStart" });
  }
});

const proposalSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  reason: z.string().max(2000).optional(),
  changes: z.array(proposalChangeSchema).min(1).max(5000),
});

function durationDays(start: Date, end: Date) {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
}

/**
 * Resolve a host-system project identifier to SI's canonical project id.
 *
 * Direct SI project ids continue to work exactly as before. For embedded host
 * integrations (currently PRMS), the host can send its external project id and
 * SI resolves it through connector_identities. The resolved project is always
 * checked against the calling API key's organization before a token is minted.
 */
async function resolveEmbedProject(
  organizationId: string,
  projectId: string,
  projectSource?: string,
  autoSyncPrms = false
) {
  const rawId = projectId.trim();
  const source = String(projectSource || "").trim().toLowerCase();

  // If the host explicitly identifies the source as PRMS, prefer the PRMS
  // connector mapping first. This avoids a coincidental SI cuid matching a
  // numeric PRMS project id.
  if (source === "prms") {
    const identity = await prisma.connectorIdentity.findFirst({
      where: {
        entityType: "project",
        externalId: { in: [rawId, rawId.replace(/^PRMS:/i, ""), `PRMS:${rawId.replace(/^PRMS:/i, "")}`] },
        connector: {
          organizationId,
          provider: "prms",
        },
      },
      select: { internalId: true },
    });

    if (identity) {
      const mappedProject = await prisma.project.findFirst({
        where: { id: identity.internalId, organizationId },
        select: { id: true, name: true },
      });

      if (mappedProject) {
        return { project: mappedProject, resolvedFrom: "prms-connector" as const };
      }
    }
  }

  // Preserve the original SI behavior: callers that already have an SI project
  // id can continue to use it directly.
  const directProject = await prisma.project.findFirst({
    where: { id: rawId, organizationId },
    select: { id: true, name: true },
  });

  if (directProject) {
    return { project: directProject, resolvedFrom: "si-project-id" as const };
  }

  // Backward-compatible PRMS fallback. Older host integrations only sent the
  // PRMS id in projectId and did not send projectSource:
  //   PRMS project 123 -> connector identity PRMS:123 -> SI project cuid
  const prmsId = rawId.replace(/^PRMS:/i, "");
  const prmsIdentity = await prisma.connectorIdentity.findFirst({
    where: {
      entityType: "project",
      externalId: { in: [rawId, `PRMS:${prmsId}`] },
      connector: {
        organizationId,
        provider: "prms",
      },
    },
    select: { internalId: true },
  });

  if (prmsIdentity) {
    const mappedProject = await prisma.project.findFirst({
      where: { id: prmsIdentity.internalId, organizationId },
      select: { id: true, name: true },
    });

    if (mappedProject) {
      return { project: mappedProject, resolvedFrom: "prms-connector" as const };
    }
  }

  // If the host supplied a PRMS id (or a numeric PRMS id from older PRMS
  // integrations), automatically provision the connection and synchronize the
  // project on first open. Existing mappings remain the fast path above.
  const looksLikePrms = source === "prms" || /^\d+$/.test(prmsId);
  if (looksLikePrms && autoSyncPrms && process.env.EMBED_AUTO_SYNC_PRMS !== "false") {
    const synced = await ensurePrmsProjectSynchronized(prmsId, organizationId);
    return { project: synced.project, resolvedFrom: synced.created ? "prms-auto-provisioned" as const : synced.synchronized ? "prms-auto-synced" as const : "prms-connector" as const, connectorId: synced.connectorId };
  }

  return null;
}

export async function enterpriseRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireApiKey);

  // Embed sessions are a trusted server-to-server bootstrap operation. The
  // calling API key authenticates the host application, but its individual
  // functional scopes must not be inherited by the short-lived project-scoped
  // embed token. The embed token receives the complete set of project scopes
  // required by the embedded Schedule Intelligence experience.
  app.post("/embed/sessions", { preHandler: requireApiKey }, async (req, reply) => {
    if (req.embedProjectId) return reply.code(403).send({ error: "Embedded sessions cannot mint another embedded session", code: "EMBED_SCOPE" });

    const body = z.object({
      projectId: z.string().min(1),
      projectSource: z.string().trim().max(40).optional(),
      ttlSeconds: z.number().int().min(60).max(3600).optional(),
      scopes: z.array(z.string()).optional(),
      appOrigin: z.string().url().optional(),
    }).parse(req.body);

    const autoSyncRequested = String(body.projectSource || "").trim().toLowerCase() === "prms" || /^\d+$/.test(body.projectId.trim().replace(/^PRMS:/i, ""));
    const resolved = await resolveEmbedProject(
      req.organizationId!,
      body.projectId,
      body.projectSource,
      autoSyncRequested,
    );

    if (!resolved) {
      return reply.code(404).send({
        error: "Project not found",
        code: "PROJECT_NOT_FOUND",
        projectId: body.projectId,
        projectSource: body.projectSource || null,
        hint: body.projectSource?.toLowerCase() === "prms"
          ? "No PRMS connector identity maps this external project to an SI project. Synchronize the PRMS connector first."
          : "Provide an SI project id or, for PRMS, send projectSource=prms after the project has been synchronized.",
      });
    }

    const project = resolved.project;
    const allowed = ["projects:read","projects:write","tasks:read","tasks:write","dependencies:read","dependencies:write","resources:read","resources:write","schedule:read","schedule:write","forecast:read"];
    // The embed token is deliberately project-scoped and short-lived. Give it
    // the complete set of functional project scopes regardless of the calling
    // API key's individual scopes. The API key remains the server-side
    // authentication/bootstrap credential and is never exposed to the browser.
    const scopes = allowed;
    const ttl = Math.min(Math.max(body.ttlSeconds ?? 900, 60), 3600);
    const token = createEmbedToken({ organizationId: req.organizationId!, projectId: project.id, scopes, ttlSeconds: ttl });
    const appUrl = (process.env.EMBED_APP_URL || process.env.APP_URL || body.appOrigin || "http://localhost:3010").replace(/\/$/, "");
    return { projectId: project.id, projectName: project.name, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), scopes, token, embedUrl: `${appUrl}/project/?id=${encodeURIComponent(project.id)}&embed=1#siEmbedToken=${encodeURIComponent(token)}`, resolvedFrom: resolved.resolvedFrom, security: "Short-lived project-scoped token. Do not expose a long-lived SI API key in browser code." };
  });

  // Read-only deterministic analysis. No AI call and no mutation.
  app.post("/projects/:id/schedule/analyze", { preHandler: requireScope("schedule:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, organizationId: req.organizationId! } });
    if (!project) return reply.code(404).send({ error: "Project not found", code: "PROJECT_NOT_FOUND" });

    const [tasks, dependencies, resources] = await Promise.all([
      prisma.task.findMany({ where: { projectId: id }, select: { id: true, name: true, expectedStart: true, expectedEnd: true, targetDate: true } }),
      prisma.dependency.findMany({ where: { projectId: id, isActive: true } }),
      prisma.resource.findMany({ where: { organizationId: req.organizationId!, assignments: { some: { task: { projectId: id } } } }, include: { assignments: { where: { task: { projectId: id } } } } }),
    ]);
    const graph = analyzeDependencyGraph(tasks, dependencies.map(d => ({ predecessorId: d.predecessorId, successorId: d.successorId, dependencyType: d.dependencyType, lagDays: d.lagDays, isActive: d.isActive })));
    const targetRisks = tasks.filter(t => t.targetDate && t.expectedEnd > t.targetDate);
    const overloadedResources = resources.filter(r => r.assignments.reduce((s, a) => s + a.allocationPct, 0) > r.availabilityPct);

    return {
      projectId: id,
      analyzedAt: new Date().toISOString(),
      deterministic: true,
      taskCount: tasks.length,
      dependencyCount: dependencies.length,
      resourceCount: resources.length,
      validDependencyGraph: graph.cycleTaskIds.length === 0,
      cycleTaskIds: graph.cycleTaskIds,
      cyclePathIds: graph.cyclePathIds,
      targetRiskCount: targetRisks.length,
      overloadedResourceCount: overloadedResources.length,
      criticalTaskCount: await prisma.scheduleResult.count({ where: { isCritical: true, task: { projectId: id } } }),
      actions: [
        ...(graph.cycleTaskIds.length ? [{ action: "REMOVE_CYCLE", priority: "BLOCKING", count: graph.cycleTaskIds.length }] : []),
        ...(targetRisks.length ? [{ action: "REVIEW_TARGET_DATES", priority: "HIGH", count: targetRisks.length }] : []),
        ...(overloadedResources.length ? [{ action: "REVIEW_RESOURCES", priority: "HIGH", count: overloadedResources.length }] : []),
        { action: "RECOMPUTE", priority: "SAFE", count: 1 },
      ],
    };
  });

  // A proposal is a persisted, reviewable change set. It uses the existing
  // Scenario model so v19 data remains compatible; status PROPOSED/APPROVED
  // gives integrations an explicit approval boundary without coupling MAC to DB writes.
  app.post("/projects/:id/schedule/proposals", { preHandler: requireScope("schedule:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = proposalSchema.parse(req.body);
    const project = await prisma.project.findFirst({ where: { id, organizationId: req.organizationId! } });
    if (!project) return reply.code(404).send({ error: "Project not found", code: "PROJECT_NOT_FOUND" });

    const tasks = await prisma.task.findMany({ where: { projectId: id }, select: { id: true, expectedStart: true, expectedEnd: true } });
    const byId = new Map(tasks.map(t => [t.id, t]));
    const invalid = body.changes.filter(c => !byId.has(c.taskId));
    if (invalid.length) return reply.code(400).send({ error: "One or more proposal tasks do not belong to this project", code: "PROPOSAL_TASK_INVALID", taskIds: invalid.map(x => x.taskId) });

    const proposal = await prisma.scenario.create({
      data: {
        projectId: id,
        name: body.name || `Schedule proposal ${new Date().toISOString()}`,
        description: body.reason,
        status: "PROPOSED",
        changes: { create: body.changes.map(c => ({ taskId: c.taskId, expectedStart: c.expectedStart, expectedEnd: c.expectedEnd, durationDays: c.durationDays })) },
      },
      include: { changes: true },
    });
    return reply.code(201).send({ proposalId: proposal.id, status: proposal.status, projectId: id, proposal });
  });

  app.get("/projects/:id/schedule/proposals", { preHandler: requireScope("schedule:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, organizationId: req.organizationId! } });
    if (!project) return reply.code(404).send({ error: "Project not found", code: "PROJECT_NOT_FOUND" });
    return prisma.scenario.findMany({ where: { projectId: id, status: { in: ["PROPOSED", "APPROVED", "PUBLISHED", "REJECTED"] } }, include: { changes: true }, orderBy: { createdAt: "desc" } });
  });

  app.post("/schedule/proposals/:proposalId/approve", { preHandler: requireScope("schedule:write") }, async (req, reply) => {
    const { proposalId } = req.params as { proposalId: string };
    const proposal = await prisma.scenario.findFirst({ where: { id: proposalId, project: { organizationId: req.organizationId! } }, include: { changes: true } });
    if (!proposal) return reply.code(404).send({ error: "Schedule proposal not found", code: "PROPOSAL_NOT_FOUND" });
    if (proposal.status !== "PROPOSED") return reply.code(409).send({ error: `Proposal is ${proposal.status.toLowerCase()} and cannot be approved`, code: "PROPOSAL_STATE_INVALID" });
    const updated = await prisma.scenario.update({ where: { id: proposalId }, data: { status: "APPROVED" }, include: { changes: true } });
    return { proposalId, status: updated.status, projectId: updated.projectId, changeCount: updated.changes.length };
  });

  // Publish is the only endpoint here that mutates the live schedule. It is
  // transactional: if validation/recompute fails, all task changes roll back.
  app.post("/schedule/proposals/:proposalId/publish", { preHandler: requireScope("schedule:write") }, async (req, reply) => {
    const { proposalId } = req.params as { proposalId: string };
    const proposal = await prisma.scenario.findFirst({ where: { id: proposalId, project: { organizationId: req.organizationId! } }, include: { changes: true } });
    if (!proposal) return reply.code(404).send({ error: "Schedule proposal not found", code: "PROPOSAL_NOT_FOUND" });
    if (proposal.status !== "APPROVED") return reply.code(409).send({ error: "Proposal must be approved before publishing", code: "PROPOSAL_NOT_APPROVED" });

    const result = await prisma.$transaction(async (tx) => {
      for (const change of proposal.changes) {
        const task = await tx.task.findFirst({ where: { id: change.taskId, projectId: proposal.projectId } });
        if (!task) throw Object.assign(new Error("Proposal contains a task outside its project"), { code: "PROPOSAL_TASK_INVALID" });
        const start = change.expectedStart ?? task.expectedStart;
        const end = change.expectedEnd ?? (change.durationDays ? new Date(start.getTime() + change.durationDays * 86400000) : task.expectedEnd);
        if (end < start) throw Object.assign(new Error(`Invalid schedule for task ${task.id}: end precedes start`), { code: "SCHEDULE_INVALID" });
        await tx.task.update({ where: { id: task.id }, data: { expectedStart: start, expectedEnd: end, durationDays: change.durationDays ?? durationDays(start, end), durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)), isManualSchedule: true } });
      }
      const recomputed = await recomputeProjectSchedule(tx, proposal.projectId);
      await tx.scenario.update({ where: { id: proposal.id }, data: { status: "PUBLISHED" } });
      return { taskCount: recomputed.size };
    });

    return { proposalId, projectId: proposal.projectId, status: "PUBLISHED", ...result, publishedAt: new Date().toISOString() };
  });
}
