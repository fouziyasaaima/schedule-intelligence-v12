"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const zod_1 = require("zod");
const node_crypto_1 = require("node:crypto");
const db_1 = require("../db");
const auth_service_1 = require("../auth-service");
const email_service_1 = require("../email-service");
const email = zod_1.z.string().email().transform(v => v.toLowerCase().trim());
const password = zod_1.z.string().min(12, "Password must be at least 12 characters").max(128);
const publicUser = (u) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, emailVerified: !!u.emailVerifiedAt, memberships: u.memberships?.map((m) => ({ organizationId: m.organizationId, organizationName: m.organization.name, role: m.role })) || [] });
async function audit(organizationId, userId, action, req, metadata) { await db_1.prisma.auditLog.create({ data: { organizationId, userId, action, ipAddress: req.ip, userAgent: req.headers["user-agent"], metadata } }).catch(() => { }); }
function token(prefix) { const raw = `${prefix}_${(0, node_crypto_1.randomBytes)(32).toString("base64url")}`; return { raw, tokenHash: (0, auth_service_1.hash)(raw) }; }
async function authRoutes(app) {
    app.post("/v1/auth/register", async (req, reply) => {
        const b = zod_1.z.object({ companyName: zod_1.z.string().min(2).max(160), firstName: zod_1.z.string().min(1).max(80), lastName: zod_1.z.string().min(1).max(80), email, password }).parse(req.body);
        const exists = await db_1.prisma.user.findUnique({ where: { email: b.email } });
        if (exists)
            return reply.code(409).send({ error: "An account with this email already exists", code: "EMAIL_EXISTS" });
        const user = await db_1.prisma.user.create({ data: { email: b.email, firstName: b.firstName, lastName: b.lastName, passwordHash: await (0, auth_service_1.passwordHash)(b.password) } });
        const org = await db_1.prisma.organization.create({ data: { name: b.companyName } });
        await db_1.prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
        const starter = await db_1.prisma.project.create({ data: { organizationId: org.id, name: "My First Schedule", startDate: new Date() } });
        const kickoff = await db_1.prisma.task.create({ data: { projectId: starter.id, name: "Project kickoff", expectedStart: new Date(), expectedEnd: new Date(Date.now() + 2 * 86400000), durationDays: 2, isManualSchedule: true } });
        const planning = await db_1.prisma.task.create({ data: { projectId: starter.id, name: "Planning & execution", expectedStart: new Date(Date.now() + 3 * 86400000), expectedEnd: new Date(Date.now() + 10 * 86400000), durationDays: 7 } });
        await db_1.prisma.dependency.create({ data: { projectId: starter.id, predecessorId: kickoff.id, successorId: planning.id, dependencyType: "FINISH_TO_START", lagDays: 0 } });
        await audit(org.id, user.id, "organization.created", req, { companyName: b.companyName });
        const vt = token("overify");
        await db_1.prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: vt.tokenHash, expiresAt: new Date(Date.now() + 24 * 3600000) } });
        await (0, auth_service_1.createSession)(user.id, reply);
        let emailDelivered = false;
        try {
            const delivery = await (0, email_service_1.sendTransactionalEmail)(user.email, "registration", { firstName: user.firstName, companyName: org.name, url: `${process.env.APP_URL || "http://localhost:3000"}/verify-email?token=${encodeURIComponent(vt.raw)}`, expiresIn: "24 hours" });
            emailDelivered = !!delivery.delivered;
        }
        catch (e) {
            req.log.error(e, "registration verification email failed");
            if (process.env.NODE_ENV === "production")
                return reply.code(503).send({ error: "We could not send the verification email. Please use resend verification or try again in a moment.", code: "EMAIL_DELIVERY_FAILED", email: user.email });
        }
        const full = await db_1.prisma.user.findUnique({ where: { id: user.id }, include: { memberships: { include: { organization: true } } } });
        return reply.code(201).send({ user: publicUser(full), organization: { id: org.id, name: org.name }, emailVerificationRequired: true, emailDelivered });
    });
    app.post("/v1/auth/login", async (req, reply) => { const b = zod_1.z.object({ email, password }).parse(req.body); const user = await db_1.prisma.user.findUnique({ where: { email: b.email.toLowerCase().trim() }, include: { memberships: { include: { organization: true } } } }); if (!user || !(await (0, auth_service_1.passwordVerify)(b.password, user.passwordHash)))
        return reply.code(401).send({ error: "Invalid email or password", code: "AUTH_INVALID" }); await (0, auth_service_1.createSession)(user.id, reply); if (!user.emailVerifiedAt)
        return reply.code(403).send({ error: "Please verify your email address before signing in. We have kept your secure session active so you can request another verification email.", code: "EMAIL_NOT_VERIFIED", email: user.email }); for (const m of user.memberships)
        await audit(m.organizationId, user.id, "auth.login", req); return { user: publicUser(user) }; });
    app.post("/v1/auth/logout", async (req, reply) => { await (0, auth_service_1.clearSession)(req, reply); return { ok: true }; });
    app.get("/v1/me", async (req, reply) => { const user = await (0, auth_service_1.currentUser)(req); if (!user)
        return reply.code(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" }); return { user: publicUser(user) }; });
    app.post("/v1/auth/verify-email", async (req, reply) => { const b = zod_1.z.object({ token: zod_1.z.string().min(20) }).parse(req.body); const row = await db_1.prisma.emailVerificationToken.findUnique({ where: { tokenHash: (0, auth_service_1.hash)(b.token) }, include: { user: { include: { memberships: { include: { organization: true } } } } } }); if (!row || row.usedAt || row.expiresAt <= new Date())
        return reply.code(400).send({ error: "Verification link is invalid or expired", code: "VERIFY_TOKEN_INVALID" }); await db_1.prisma.$transaction([db_1.prisma.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }), db_1.prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } })]); for (const m of row.user.memberships)
        await audit(m.organizationId, row.userId, "auth.email_verified", req); await (0, email_service_1.sendTransactionalEmail)(row.user.email, "welcome", { firstName: row.user.firstName, companyName: row.user.memberships?.[0]?.organization?.name || "your organization", url: process.env.APP_URL || "http://localhost:3000" }).catch(e => req.log.error(e, "welcome email failed")); await (0, auth_service_1.createSession)(row.userId, reply); return { ok: true, verified: true }; });
    app.post("/v1/auth/resend-verification", async (req, reply) => { const user = await (0, auth_service_1.currentUser)(req); if (!user)
        return reply.code(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" }); if (user.emailVerifiedAt)
        return { ok: true, alreadyVerified: true }; await db_1.prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } }); const t = token("overify"); await db_1.prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: t.tokenHash, expiresAt: new Date(Date.now() + 24 * 3600000) } }); const org = user.memberships?.[0]?.organization?.name || "your organization"; await (0, email_service_1.sendTransactionalEmail)(user.email, "verify", { firstName: user.firstName, companyName: org, url: `${process.env.APP_URL || "http://localhost:3000"}/verify-email?token=${encodeURIComponent(t.raw)}`, expiresIn: "24 hours" }); return { ok: true }; });
    app.post("/v1/auth/forgot-password", async (req, reply) => { const b = zod_1.z.object({ email }).parse(req.body); const user = await db_1.prisma.user.findUnique({ where: { email: b.email } }); if (!user)
        return { ok: true }; await db_1.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }); const t = token("oreset"); await db_1.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: t.tokenHash, expiresAt: new Date(Date.now() + 3600000) } }); await (0, email_service_1.sendTransactionalEmail)(user.email, "reset", { firstName: user.firstName, url: `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${encodeURIComponent(t.raw)}`, expiresIn: "1 hour" }); return { ok: true }; });
    app.post("/v1/auth/reset-password", async (req, reply) => { const b = zod_1.z.object({ token: zod_1.z.string().min(20), password }).parse(req.body); const row = await db_1.prisma.passwordResetToken.findUnique({ where: { tokenHash: (0, auth_service_1.hash)(b.token) }, include: { user: { include: { memberships: { include: { organization: true } } } } } }); if (!row || row.usedAt || row.expiresAt <= new Date())
        return reply.code(400).send({ error: "Reset link is invalid or expired", code: "RESET_TOKEN_INVALID" }); await db_1.prisma.$transaction([db_1.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }), db_1.prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await (0, auth_service_1.passwordHash)(b.password) } }), db_1.prisma.session.deleteMany({ where: { userId: row.userId } })]); await (0, auth_service_1.createSession)(row.userId, reply); for (const m of row.user.memberships)
        await audit(m.organizationId, row.userId, "auth.password_reset", req); return { ok: true }; });
    app.get("/v1/organizations/:id/members", async (req, reply) => { const user = await (0, auth_service_1.currentUser)(req); if (!user)
        return reply.code(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" }); const { id } = req.params; const member = user.memberships.find(m => m.organizationId === id); if (!member)
        return reply.code(403).send({ error: "Organization access denied", code: "ORG_FORBIDDEN" }); const members = await db_1.prisma.membership.findMany({ where: { organizationId: id }, include: { user: { select: { id: true, email: true, firstName: true, lastName: true, emailVerifiedAt: true } } } }); return members.map(m => ({ id: m.id, user: m.user, role: m.role, createdAt: m.createdAt })); });
    app.get("/v1/organizations/:id/audit-log", async (req, reply) => { const user = await (0, auth_service_1.currentUser)(req); if (!user)
        return reply.code(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" }); const { id } = req.params; const member = user.memberships.find(m => m.organizationId === id); if (!member || !["OWNER", "ADMIN"].includes(member.role))
        return reply.code(403).send({ error: "Administrator access required", code: "ROLE_FORBIDDEN" }); return db_1.prisma.auditLog.findMany({ where: { organizationId: id }, orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { email: true, firstName: true, lastName: true } } } }); });
}
//# sourceMappingURL=auth.js.map