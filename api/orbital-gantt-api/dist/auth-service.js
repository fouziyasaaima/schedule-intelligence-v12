"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_COOKIE = exports.hash = void 0;
exports.createSession = createSession;
exports.clearSession = clearSession;
exports.currentUser = currentUser;
exports.passwordHash = passwordHash;
exports.passwordVerify = passwordVerify;
const node_crypto_1 = require("node:crypto");
const node_util_1 = require("node:util");
const db_1 = require("./db");
const scrypt = (0, node_util_1.promisify)(node_crypto_1.scrypt);
const SESSION_COOKIE = "orbital_session";
exports.SESSION_COOKIE = SESSION_COOKIE;
const SESSION_DAYS = 7;
const hash = (v) => (0, node_crypto_1.createHash)("sha256").update(v).digest("hex");
exports.hash = hash;
async function passwordHash(password) { const salt = (0, node_crypto_1.randomBytes)(16).toString("hex"); const derived = await scrypt(password, salt, 64); return `scrypt$${salt}$${derived.toString("hex")}`; }
async function passwordVerify(password, encoded) { const [scheme, salt, hex] = encoded.split("$"); if (scheme !== "scrypt" || !salt || !hex)
    return false; const derived = await scrypt(password, salt, 64); const stored = Buffer.from(hex, "hex"); return stored.length === derived.length && (0, node_crypto_1.timingSafeEqual)(stored, derived); }
function newToken(prefix) { return `${prefix}_${(0, node_crypto_1.randomBytes)(32).toString("base64url")}`; }
async function createSession(userId, reply) { const raw = newToken("os"); await db_1.prisma.session.create({ data: { userId, tokenHash: hash(raw), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000) } }); reply.setCookie(SESSION_COOKIE, raw, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 }); return raw; }
async function clearSession(req, reply) { const raw = req.cookies?.[SESSION_COOKIE]; if (raw)
    await db_1.prisma.session.deleteMany({ where: { tokenHash: hash(raw) } }); reply.clearCookie(SESSION_COOKIE, { path: "/" }); }
async function currentUser(req) { const raw = req.cookies?.[SESSION_COOKIE]; if (!raw)
    return null; const session = await db_1.prisma.session.findUnique({ where: { tokenHash: hash(raw) }, include: { user: { include: { memberships: { include: { organization: true } } } } } }); if (!session || session.expiresAt <= new Date()) {
    if (session)
        await db_1.prisma.session.delete({ where: { id: session.id } });
    return null;
} await db_1.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }); return session.user; }
//# sourceMappingURL=auth-service.js.map