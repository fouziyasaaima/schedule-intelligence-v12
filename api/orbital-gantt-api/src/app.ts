import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { authRoutes } from "./routes/auth";
import { organizationRoutes } from "./routes/organization";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import { projectRoutes } from "./routes/projects";
import { taskRoutes } from "./routes/tasks";
import { dependencyRoutes } from "./routes/dependencies";
import { resourceRoutes } from "./routes/resources";
import { scheduleRoutes } from "./routes/schedule";
import { simulationRoutes } from "./routes/simulation";
import { scenarioRoutes } from "./routes/scenarios";
import { docsRoutes } from "./routes/docs";
import { intelligenceRoutes } from "./routes/intelligence";
import { historyRoutes } from "./routes/history";
import { connectorRoutes } from "./routes/connectors";
import { prisma } from "./db";
import { runScheduledConnectorSyncs } from "./connectors/service";
import { aiRoutes } from "./routes/ai";
import { importRoutes } from "./routes/imports";
import { runAiWatchCycle } from "./ai-service";

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024, trustProxy: process.env.TRUST_PROXY === "true" });

  // Lightweight defense-in-depth limits. For multi-instance production deployments,
  // place a shared rate limiter/API gateway in front of the service as well.
  const buckets = new Map<string, { count: number; reset: number }>();
  app.addHook("onRequest", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    const key = String(req.headers.authorization || req.ip || "anonymous");
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.reset <= now) buckets.set(key, { count: 1, reset: now + 60_000 });
    else { current.count += 1; if (current.count > 240) { reply.header("Retry-After", "60"); return reply.code(429).send({ error: "Rate limit exceeded", code: "RATE_LIMITED" }); } }
  });

  await app.register(sensible);
  await app.register(cookie);
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
  await app.register(cors, {
    origin: Array.from(new Set([...devOrigins, ...configuredOrigins])),
    credentials: true,
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Validation failed", details: err.issues });
    }
    req.log.error(err);
    const code = (err as any).code;
    const status = code === "SCHEDULE_CYCLE" ? 409 : (err.statusCode || 500);
    const publicMessage = status >= 500 && process.env.NODE_ENV === "production"
      ? "Schedule Intelligence API encountered an internal error."
      : (err.message || "Internal error");
    return reply.code(status).send({
      error: publicMessage,
      code: code || "API_ERROR",
      requestId: req.id,
      ...(code === "SCHEDULE_CYCLE" ? { cycleTaskIds: (err as any).cycleTaskIds || [], cyclePathIds: (err as any).cyclePathIds || [] } : {}),
    });
  });

  app.get("/health", async () => ({ status: "ok", service: "schedule-intelligence-api", version: process.env.APP_VERSION || "19.1.0", time: new Date().toISOString() }));
  app.get("/ready", async (_req, reply) => {
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      return { status: "ready", database: "ok", service: "schedule-intelligence-api", version: process.env.APP_VERSION || "19.1.0" };
    } catch {
      return reply.code(503).send({ status: "not_ready", database: "unavailable", code: "DATABASE_UNAVAILABLE" });
    }
  });
  await app.register(docsRoutes);
  await app.register(authRoutes);
  await app.register(organizationRoutes);

  await app.register(projectRoutes, { prefix: "/v1" });
  await app.register(taskRoutes, { prefix: "/v1" });
  await app.register(dependencyRoutes, { prefix: "/v1" });
  await app.register(resourceRoutes, { prefix: "/v1" });
  await app.register(scheduleRoutes, { prefix: "/v1" });
  await app.register(simulationRoutes, { prefix: "/v1" });
  await app.register(scenarioRoutes, { prefix: "/v1" });
  await app.register(intelligenceRoutes, { prefix: "/v1" });
  await app.register(historyRoutes, { prefix: "/v1" });
  await app.register(connectorRoutes, { prefix: "/v1" });
  await app.register(aiRoutes, { prefix: "/v1" });
  await app.register(importRoutes, { prefix: "/v1" });
  const connectorScheduler = setInterval(() => { void runScheduledConnectorSyncs(); }, 60_000);
  const aiIntervalMinutes = Math.max(15, Number(process.env.MAC_WATCH_INTERVAL_MINUTES || process.env.AI_WATCH_INTERVAL_MINUTES || 15));
  const aiScheduler = setInterval(() => { void runAiWatchCycle((message) => app.log.warn(message)); }, aiIntervalMinutes * 60_000);
  app.addHook("onClose", async () => { clearInterval(connectorScheduler); clearInterval(aiScheduler); });

  return app;
}
