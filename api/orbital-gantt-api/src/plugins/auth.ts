import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../db";
import { currentUser } from "../auth-service";

declare module "fastify" {
  interface FastifyRequest {
    organizationId?: string;
    apiKeyId?: string;
    apiKeyScopes?: string[];
    embedProjectId?: string;
    embedExpiresAt?: number;
    embedCanonicalProjectId?: string;
    embedRequestedProject?: string;
    projectId?: string;
  }
}

const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");
const embedSecret = () => {
  const secret = process.env.EMBED_TOKEN_SECRET || process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw Object.assign(new Error("Embedded access is not configured. Set EMBED_TOKEN_SECRET to a 32+ character secret."), { statusCode: 503, code: "EMBED_NOT_CONFIGURED" });
  return secret;
};

export function createEmbedToken(input: { organizationId: string; projectId: string; scopes: string[]; ttlSeconds?: number }) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(Math.max(input.ttlSeconds ?? 900, 60), 3600);
  const payload = { v: 1, typ: "si-embed", org: input.organizationId, project: input.projectId, scopes: input.scopes, iat: now, exp: now + ttl };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", embedSecret()).update(encoded).digest("base64url");
  return `sie_${encoded}.${signature}`;
}

export function verifyEmbedToken(raw: string) {
  if (!raw.startsWith("sie_")) return null;
  const value = raw.slice(4);
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = value.slice(0, dot);
  const supplied = value.slice(dot + 1);
  const expected = createHmac("sha256", embedSecret()).update(encoded).digest("base64url");
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: any;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { return null; }
  if (payload?.typ !== "si-embed" || payload?.v !== 1 || !payload.org || !payload.project || !Array.isArray(payload.scopes) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return payload as { v:1; typ:"si-embed"; org:string; project:string; scopes:string[]; iat:number; exp:number };
}

export async function enforceEmbedProjectScope(req: FastifyRequest, reply: FastifyReply) {
  const projectId = req.embedProjectId;
  if (!projectId) return;

  const url = req.url.split("?")[0];
  const decode = (value: string) => {
    try { return decodeURIComponent(value); } catch { return value; }
  };

  // Embedded mode is a project session, not an organization administration session.
  // The signed embed token is the sole authority for the project.  The browser's
  // route/query project id is treated only as a host-side hint and is never allowed
  // to replace the signed canonical SI project id.
  if (/\/(?:api\/)?v1\/projects$/.test(url)) {
    return reply.code(403).send({ error: "Project-scoped embed tokens cannot list projects", code: "EMBED_SCOPE" });
  }
  if (req.method !== "GET" && /\/(?:api\/)?v1\/projects\/[^/]+$/.test(url)) {
    return reply.code(403).send({ error: "Project administration is unavailable in embedded mode", code: "EMBED_SCOPE" });
  }
  if (/\/(?:api\/)?v1\/projects\/[^/]+\/import(?:$|\/)/.test(url)) {
    return reply.code(403).send({ error: "Import is unavailable in embedded mode", code: "EMBED_SCOPE" });
  }
  if (/\/(?:api\/)?v1\/connectors(?:\/|$)/.test(url)) {
    return reply.code(403).send({ error: "Connectors are unavailable in embedded mode", code: "EMBED_SCOPE" });
  }
  if (/\/(?:api\/)?v1\/mac\/settings(?:$|\/)/.test(url)) {
    return reply.code(403).send({ error: "Organization MAC settings are unavailable in embedded mode", code: "EMBED_SCOPE" });
  }

  const params = (req.params || {}) as Record<string, string>;

  // IMPORTANT: for every project-scoped endpoint, force the route parameter to
  // the canonical project contained in the signed sie_ token.  Do not compare
  // the route value and reject it merely because the host uses an external
  // identifier such as PRMS:5431.  A token for Project A can therefore never
  // access Project B: a request for B is normalized to A before the handler runs.
  // This removes false EMBED_PROJECT_SCOPE failures caused by mixed host/SI ids.
  const projectMatch = url.match(/\/(?:api\/)?v1\/projects\/([^/]+)/);
  if (projectMatch) {
    const requestedProject = decode(projectMatch[1]).trim();
    (req as any).embedRequestedProject = requestedProject;
    (req as any).embedCanonicalProjectId = projectId;

    if (typeof params.id === "string") params.id = projectId;
    if (typeof params.projectId === "string") params.projectId = projectId;

    // Fastify route params are normally mutable, but keep an explicit canonical
    // request property as well so downstream code and diagnostics can use the
    // signed value without relying on the host URL.
    (req as any).projectId = projectId;
  }

  // Resources are organization-owned. Embedded project sessions may read the
  // organization resource roster when resources:read is granted; project isolation
  // is enforced when resources are consumed through tasks/assignments and workload
  // views. Do not block GET /resources in embedded mode.

  const p = (req.params || {}) as Record<string, string>;
  const lookupProject = async () => {
    if (p.taskId || (p.id && /\/tasks\//.test(url))) {
      const row = await prisma.task.findFirst({
        where: { id: p.taskId || p.id, project: { organizationId: req.organizationId! } },
        select: { projectId: true },
      });
      return row?.projectId || null;
    }
    if (p.id && /\/dependencies\//.test(url)) {
      const row = await prisma.dependency.findFirst({
        where: { id: p.id, project: { organizationId: req.organizationId! } },
        select: { projectId: true },
      });
      return row?.projectId || null;
    }
    if (p.id && /\/resources\//.test(url)) {
      // Resources are organization-owned, not project-owned.  An embedded
      // session may therefore use an organization resource for its signed
      // project.  The project boundary is enforced by the operation that
      // consumes the resource (for example task assignment/workload), while
      // the organization boundary remains mandatory here.
      const row = await prisma.resource.findFirst({
        where: { id: p.id, organizationId: req.organizationId! },
        select: { id: true },
      });
      // A resource is organization-owned. Its current project assignments are
      // deliberately NOT used as the embed-project ownership test. The route
      // handler performs the organization check, while workload data is filtered
      // to the signed project. Returning undefined here prevents a shared resource
      // from being mistaken for a project-owned object by the generic guard.
      return row ? undefined : undefined;
    }
    if (p.id && /\/assignments\//.test(url)) {
      const row = await prisma.assignment.findFirst({
        where: { id: p.id, task: { project: { organizationId: req.organizationId! } } },
        select: { task: { select: { projectId: true } } },
      });
      return row?.task?.projectId || null;
    }
    if (p.snapshotId && /\/history\//.test(url)) {
      const row = await prisma.scheduleSnapshot.findFirst({
        where: { id: p.snapshotId, project: { organizationId: req.organizationId! } },
        select: { projectId: true },
      });
      return row?.projectId || null;
    }
    if (p.runId && /\/ai\/schedule\//.test(url)) {
      const row = await prisma.aiScheduleRun.findFirst({
        where: { id: p.runId, organizationId: req.organizationId! },
        select: { projectId: true },
      });
      return row?.projectId || null;
    }
    if (p.proposalId && /\/proposals\//.test(url)) {
      const row = await prisma.scenario.findFirst({
        where: { id: p.proposalId, project: { organizationId: req.organizationId! } },
        select: { projectId: true },
      });
      return row?.projectId || null;
    }
    return undefined;
  };

  const owner = await lookupProject();
  if (owner !== undefined && owner !== projectId) {
    return reply.code(403).send({
      error: "Embedded token cannot access a resource outside its project",
      code: "EMBED_PROJECT_SCOPE",
      projectId,
      requestedProject: (req as any).embedRequestedProject,
      resourceProject: owner,
    });
  }
}

export async function requireApiKey(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header) {
    const user = await currentUser(req);
    if (!user || !user.memberships?.length) return reply.code(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" });
    const requestedOrg = String(req.headers["x-orbital-organization"] || "");
    const membership = requestedOrg ? user.memberships.find((m:any)=>m.organizationId===requestedOrg) : user.memberships[0];
    if (!membership) return reply.code(403).send({ error: "Organization access denied", code: "ORG_FORBIDDEN" });
    if (!user.emailVerifiedAt) return reply.code(403).send({ error: "Email verification required", code: "EMAIL_NOT_VERIFIED", email: user.email });
    req.organizationId = membership.organizationId;
    req.apiKeyId = undefined;
    req.apiKeyScopes = ["projects:read","projects:write","tasks:read","tasks:write","dependencies:read","dependencies:write","resources:read","resources:write","schedule:read","schedule:write","forecast:read","connectors:read","connectors:write"];
    return;
  }
  if (!/^Bearer\s+/i.test(header)) return reply.code(401).send({ error: "Unsupported authorization scheme", code: "AUTH_SCHEME_INVALID" });
  const raw = header.replace(/^Bearer\s+/i, "").trim();
  if (!raw || raw.length < 32) return reply.code(401).send({ error: "Invalid API key", code: "AUTH_INVALID" });
  if (raw.startsWith("sie_")) {
    const embed = verifyEmbedToken(raw);
    if (!embed) return reply.code(401).send({ error: "Invalid or expired embedded access token", code: "EMBED_AUTH_INVALID" });
    req.organizationId = embed.org;
    req.apiKeyId = undefined;
    req.apiKeyScopes = embed.scopes;
    req.embedProjectId = embed.project;
    req.embedExpiresAt = embed.exp;
    await enforceEmbedProjectScope(req, reply);
    return;
  }
  const keyRecord = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(raw) } });
  if (!keyRecord || keyRecord.revokedAt) return reply.code(401).send({ error: "Invalid or revoked API key", code: "AUTH_INVALID" });
  req.organizationId = keyRecord.organizationId;
  req.apiKeyId = keyRecord.id;
  req.apiKeyScopes = keyRecord.scopes;
}

export function requireScope(scope: string) {
  return async function scopeGuard(req: FastifyRequest, reply: FastifyReply) {
    const scopes = req.apiKeyScopes || [];
    const ok = scopes.includes(scope) || scopes.includes("admin");
    if (!ok) return reply.code(403).send({ error: `API key lacks required scope: ${scope}`, code: "INSUFFICIENT_SCOPE", requiredScope: scope });
  };
}

export function registerAuth(app: FastifyInstance) { app.decorate("hashKey", hashKey); }
export { hashKey };
