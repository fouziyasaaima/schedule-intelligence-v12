"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationRoutes = organizationRoutes;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const db_1 = require("../db");
const auth_service_1 = require("../auth-service");
const email_service_1 = require("../email-service");
const hash = (v) => (0, node_crypto_1.createHash)("sha256").update(v).digest("hex");
async function admin(req, reply) { const user = await (0, auth_service_1.currentUser)(req); if (!user)
    return reply.code(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" }); const id = req.params.id; const m = user.memberships.find((x) => x.organizationId === id); if (!m)
    return reply.code(403).send({ error: "Organization access denied", code: "ORG_FORBIDDEN" }); if (!["OWNER", "ADMIN"].includes(m.role))
    return reply.code(403).send({ error: "Administrator access required", code: "ROLE_FORBIDDEN" }); return { user, m }; }
async function organizationRoutes(app) {
    app.get("/v1/organizations/:id/api-keys", async (req, reply) => { const a = await admin(req, reply); if (!a || reply.sent)
        return; return db_1.prisma.apiKey.findMany({ where: { organizationId: req.params.id }, select: { id: true, label: true, scopes: true, createdAt: true, revokedAt: true } }); });
    app.post("/v1/organizations/:id/api-keys", async (req, reply) => { const a = await admin(req, reply); if (!a || reply.sent)
        return; const b = zod_1.z.object({ label: zod_1.z.string().min(2).max(100), scopes: zod_1.z.array(zod_1.z.string()).min(1).max(30) }).parse(req.body); const raw = `orb_live_${(0, node_crypto_1.randomBytes)(32).toString("hex")}`; const key = await db_1.prisma.apiKey.create({ data: { organizationId: req.params.id, label: b.label, keyHash: hash(raw), scopes: b.scopes } }); await db_1.prisma.auditLog.create({ data: { organizationId: key.organizationId, userId: a.user.id, action: "api_key.created", resourceType: "api_key", resourceId: key.id, ipAddress: req.ip, userAgent: req.headers["user-agent"], metadata: { label: key.label, scopes: key.scopes } } }); return reply.code(201).send({ id: key.id, label: key.label, scopes: key.scopes, apiKey: raw, warning: "Copy this key now. The secret cannot be retrieved again." }); });
    app.delete("/v1/organizations/:id/api-keys/:keyId", async (req, reply) => { const a = await admin(req, reply); if (!a || reply.sent)
        return; const p = req.params; const key = await db_1.prisma.apiKey.findFirst({ where: { id: p.keyId, organizationId: p.id } }); if (!key)
        return reply.code(404).send({ error: "API key not found" }); await db_1.prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } }); await db_1.prisma.auditLog.create({ data: { organizationId: key.organizationId, userId: a.user.id, action: "api_key.revoked", resourceType: "api_key", resourceId: key.id, ipAddress: req.ip, userAgent: req.headers["user-agent"] } }); return { ok: true }; });
    app.post("/v1/organizations/:id/invitations", async (req, reply) => { const a = await admin(req, reply); if (!a || reply.sent)
        return; const b = zod_1.z.object({ email: zod_1.z.string().email(), role: zod_1.z.enum(["ADMIN", "PROJECT_MANAGER", "PLANNER", "RESOURCE_MANAGER", "CONTRIBUTOR", "VIEWER"]) }).parse(req.body); const raw = `oinv_${(0, node_crypto_1.randomBytes)(32).toString("base64url")}`; const invitation = await db_1.prisma.invitation.create({ data: { organizationId: req.params.id, email: b.email.toLowerCase(), role: b.role, tokenHash: hash(raw), expiresAt: new Date(Date.now() + 7 * 86400000), invitedById: a.user.id } }); const inviteUrl = `${process.env.APP_URL || "http://localhost:3000"}/accept-invitation?token=${encodeURIComponent(raw)}`; const result = await (0, email_service_1.sendTransactionalEmail)(invitation.email, "invite", { companyName: a.m.organization?.name || "your organization", inviterName: `${a.user.firstName} ${a.user.lastName}`, role: invitation.role, url: inviteUrl, expiresIn: "7 days" }).catch(e => { req.log.error(e, "invitation email failed"); return { delivered: false }; }); return reply.code(201).send({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, delivery: result.delivered ? "sent" : "failed" }); });
}
//# sourceMappingURL=organization.js.map