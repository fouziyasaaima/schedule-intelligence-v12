"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const auth_1 = require("./routes/auth");
const organization_1 = require("./routes/organization");
const sensible_1 = __importDefault(require("@fastify/sensible"));
const zod_1 = require("zod");
const projects_1 = require("./routes/projects");
const tasks_1 = require("./routes/tasks");
const dependencies_1 = require("./routes/dependencies");
const resources_1 = require("./routes/resources");
const schedule_1 = require("./routes/schedule");
const simulation_1 = require("./routes/simulation");
const scenarios_1 = require("./routes/scenarios");
const docs_1 = require("./routes/docs");
const intelligence_1 = require("./routes/intelligence");
const history_1 = require("./routes/history");
const connectors_1 = require("./routes/connectors");
const db_1 = require("./db");
const service_1 = require("./connectors/service");
const ai_1 = require("./routes/ai");
const ai_service_1 = require("./ai-service");
async function buildApp() {
    const app = (0, fastify_1.default)({ logger: true, bodyLimit: 1024 * 1024, trustProxy: process.env.TRUST_PROXY === "true" });
    // Lightweight defense-in-depth limits. For multi-instance production deployments,
    // place a shared rate limiter/API gateway in front of the service as well.
    const buckets = new Map();
    app.addHook("onRequest", async (req, reply) => {
        reply.header("X-Content-Type-Options", "nosniff");
        reply.header("X-Frame-Options", "DENY");
        reply.header("Referrer-Policy", "no-referrer");
        reply.header("Cache-Control", "no-store");
        const key = String(req.headers.authorization || req.ip || "anonymous");
        const now = Date.now();
        const current = buckets.get(key);
        if (!current || current.reset <= now)
            buckets.set(key, { count: 1, reset: now + 60_000 });
        else {
            current.count += 1;
            if (current.count > 240) {
                reply.header("Retry-After", "60");
                return reply.code(429).send({ error: "Rate limit exceeded", code: "RATE_LIMITED" });
            }
        }
    });
    await app.register(sensible_1.default);
    await app.register(cookie_1.default);
    const configuredOrigins = (process.env.CORS_ORIGINS || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    const devOrigins = process.env.NODE_ENV === "production" ? [] : [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ];
    await app.register(cors_1.default, {
        origin: Array.from(new Set([...devOrigins, ...configuredOrigins])),
        credentials: true,
    });
    app.setErrorHandler((err, req, reply) => {
        if (err instanceof zod_1.ZodError) {
            return reply.code(400).send({ error: "Validation failed", details: err.issues });
        }
        req.log.error(err);
        const code = err.code;
        const status = code === "SCHEDULE_CYCLE" ? 409 : (err.statusCode || 500);
        const publicMessage = status >= 500 && process.env.NODE_ENV === "production"
            ? "Schedule Intelligence API encountered an internal error."
            : (err.message || "Internal error");
        return reply.code(status).send({
            error: publicMessage,
            code: code || "API_ERROR",
            requestId: req.id,
            ...(code === "SCHEDULE_CYCLE" ? { cycleTaskIds: err.cycleTaskIds || [], cyclePathIds: err.cyclePathIds || [] } : {}),
        });
    });
    app.get("/health", async () => ({ status: "ok", service: "schedule-intelligence-api", version: "13.0.0", time: new Date().toISOString() }));
    app.get("/ready", async (_req, reply) => {
        try {
            await db_1.prisma.$queryRawUnsafe("SELECT 1");
            return { status: "ready", database: "ok", service: "schedule-intelligence-api", version: "13.0.0" };
        }
        catch {
            return reply.code(503).send({ status: "not_ready", database: "unavailable", code: "DATABASE_UNAVAILABLE" });
        }
    });
    await app.register(docs_1.docsRoutes);
    await app.register(auth_1.authRoutes);
    await app.register(organization_1.organizationRoutes);
    await app.register(projects_1.projectRoutes, { prefix: "/v1" });
    await app.register(tasks_1.taskRoutes, { prefix: "/v1" });
    await app.register(dependencies_1.dependencyRoutes, { prefix: "/v1" });
    await app.register(resources_1.resourceRoutes, { prefix: "/v1" });
    await app.register(schedule_1.scheduleRoutes, { prefix: "/v1" });
    await app.register(simulation_1.simulationRoutes, { prefix: "/v1" });
    await app.register(scenarios_1.scenarioRoutes, { prefix: "/v1" });
    await app.register(intelligence_1.intelligenceRoutes, { prefix: "/v1" });
    await app.register(history_1.historyRoutes, { prefix: "/v1" });
    await app.register(connectors_1.connectorRoutes, { prefix: "/v1" });
    await app.register(ai_1.aiRoutes, { prefix: "/v1" });
    const connectorScheduler = setInterval(() => { void (0, service_1.runScheduledConnectorSyncs)(); }, 60_000);
    const aiIntervalMinutes = Math.max(15, Number(process.env.MAC_WATCH_INTERVAL_MINUTES || process.env.AI_WATCH_INTERVAL_MINUTES || 15));
    const aiScheduler = setInterval(() => { void (0, ai_service_1.runAiWatchCycle)((message) => app.log.warn(message)); }, aiIntervalMinutes * 60_000);
    app.addHook("onClose", async () => { clearInterval(connectorScheduler); clearInterval(aiScheduler); });
    return app;
}
//# sourceMappingURL=app.js.map