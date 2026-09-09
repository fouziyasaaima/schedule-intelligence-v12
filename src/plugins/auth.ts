import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { currentUser } from "../auth-service";

declare module "fastify" {
  interface FastifyRequest {
    organizationId?: string;
    apiKeyId?: string;
    apiKeyScopes?: string[];
  }
}

const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

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
    req.apiKeyScopes = ["projects:read","projects:write","tasks:read","tasks:write","dependencies:read","dependencies:write","resources:read","resources:write","schedule:read","schedule:write","forecast:read"];
    return;
  }
  if (!/^Bearer\s+/i.test(header)) return reply.code(401).send({ error: "Unsupported authorization scheme", code: "AUTH_SCHEME_INVALID" });
  const raw = header.replace(/^Bearer\s+/i, "").trim();
  if (!raw || raw.length < 32) return reply.code(401).send({ error: "Invalid API key", code: "AUTH_INVALID" });
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
