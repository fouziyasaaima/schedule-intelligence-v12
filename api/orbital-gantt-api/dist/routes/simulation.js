"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulationRoutes = simulationRoutes;
const db_1 = require("../db");
const auth_1 = require("../plugins/auth");
const cpm_1 = require("../scheduling/cpm");
const DAY_MS = 86_400_000;
function triangular(min, mode, max) {
    const u = Math.random();
    const c = (mode - min) / Math.max(0.000001, max - min);
    return u < c ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}
function percentile(sorted, p) {
    const i = (sorted.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return Math.round(lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
}
function correlation(sumX, sumY, sumXX, sumYY, sumXY, n) {
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(Math.max(0, (n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY)));
    return denominator ? numerator / denominator : 0;
}
async function simulationRoutes(app) {
    app.addHook("preHandler", auth_1.requireApiKey);
    app.post("/projects/:id/simulations/monte-carlo", { preHandler: (0, auth_1.requireScope)("forecast:read") }, async (req, reply) => {
        const { id } = req.params;
        const body = (req.body || {});
        const iterations = Math.max(500, Math.min(50000, Number(body.iterations) || 5000));
        const uncertainty = Math.max(0.05, Math.min(0.8, Number(body.uncertainty) || 0.3));
        const project = await db_1.prisma.project.findFirst({ where: { id, organizationId: req.organizationId } });
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        const tasks = await db_1.prisma.task.findMany({
            where: { projectId: id },
            include: { predecessorLinks: { where: { isActive: true } }, scheduleResult: true },
            orderBy: [{ sortOrder: "asc" }, { expectedStart: "asc" }],
        });
        if (!tasks.length)
            return { projectId: id, iterations, finish: null, histogram: [], riskAttribution: [], interpretation: "There are no tasks to simulate." };
        const deps = tasks.flatMap((t) => t.predecessorLinks.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId, dependencyType: d.dependencyType, lagDays: d.lagDays, isActive: d.isActive })));
        const graph = (0, cpm_1.analyzeDependencyGraph)(tasks, deps);
        if (graph.cycleTaskIds.length) {
            const names = new Map(tasks.map((t) => [t.id, t.name]));
            return reply.code(409).send({
                error: graph.cyclePathIds.length
                    ? `Forecast blocked by a circular dependency: ${graph.cyclePathIds.map((x) => names.get(x) || x).join(" → ")}.`
                    : "Forecast cannot run because the dependency graph contains a cycle.",
                code: "SCHEDULE_CYCLE",
                cycleTaskIds: graph.cycleTaskIds,
                cyclePathIds: graph.cyclePathIds,
                cyclePathNames: graph.cyclePathIds.map((x) => names.get(x) || x),
            });
        }
        const byId = new Map(tasks.map((t) => [t.id, t]));
        const cpmTasks = tasks.map((t) => ({
            id: t.id,
            expectedStart: t.expectedStart,
            expectedEnd: t.expectedEnd,
            durationDays: Math.max(1, t.durationDays),
            isManualSchedule: t.isManualSchedule,
            targetDate: t.targetDate,
        }));
        // Monte Carlo must start from the same deterministic schedule the live Gantt
        // uses. Using raw task dates here can produce a forecast that disagrees with
        // the visible schedule, especially when dependency-driven tasks have moved.
        const baselineSchedule = (0, cpm_1.computeSchedule)(cpmTasks, deps);
        const simTasks = graph.order.map((taskId) => {
            const t = byId.get(taskId);
            const baseline = baselineSchedule.get(taskId);
            return {
                id: taskId,
                start: (baseline?.expectedStart || t.expectedStart).getTime(),
                duration: Math.max(1, t.durationDays),
                predecessors: t.predecessorLinks.map((d) => ({ id: d.predecessorId, type: d.dependencyType, lag: d.lagDays })),
            };
        });
        // Use the earliest real schedule anchor as the forecast origin, while
        // preserving an earlier explicit project start when one exists. This avoids
        // collapsing valid schedules to 0 days when stale project metadata is later
        // than the actual task schedule.
        const earliestTaskStart = Math.min(...simTasks.map((t) => t.start));
        const forecastOrigin = Math.min(project.startDate.getTime(), earliestTaskStart);
        const finishes = [];
        const finishBuckets = new Map();
        const stats = new Map();
        simTasks.forEach((t) => stats.set(t.id, { sumX: 0, sumXX: 0, sumXY: 0, critical: 0, total: 0 }));
        let sumY = 0, sumYY = 0;
        for (let i = 0; i < iterations; i += 1) {
            const sampled = new Map();
            let projectFinish = forecastOrigin;
            const sampledDurations = new Map();
            for (const t of simTasks) {
                const low = Math.max(0.25, t.duration * (1 - uncertainty));
                const high = Math.max(low + 0.01, t.duration * (1 + uncertainty * 1.7));
                const dur = triangular(low, t.duration, high);
                sampledDurations.set(t.id, dur);
                let start = t.start;
                for (const p of t.predecessors) {
                    const prev = sampled.get(p.id);
                    if (!prev)
                        continue;
                    const lag = p.lag * DAY_MS;
                    if (p.type === "START_TO_START")
                        start = Math.max(start, prev.start + lag);
                    else if (p.type === "FINISH_TO_FINISH")
                        start = Math.max(start, prev.finish + lag - dur * DAY_MS);
                    else if (p.type === "START_TO_FINISH")
                        start = Math.max(start, prev.start + lag - dur * DAY_MS);
                    else
                        start = Math.max(start, prev.finish + lag);
                }
                const finish = start + dur * DAY_MS;
                sampled.set(t.id, { start, finish, duration: dur });
                projectFinish = Math.max(projectFinish, finish);
            }
            const days = Math.max(0, Math.round((projectFinish - forecastOrigin) / DAY_MS));
            finishes.push(days);
            finishBuckets.set(days, (finishBuckets.get(days) || 0) + 1);
            sumY += days;
            sumYY += days * days;
            for (const t of simTasks) {
                const x = sampledDurations.get(t.id) || t.duration;
                const st = stats.get(t.id);
                st.sumX += x;
                st.sumXX += x * x;
                st.sumXY += x * days;
                st.total += 1;
                if (Math.round((sampled.get(t.id).finish - projectFinish) / DAY_MS) === 0)
                    st.critical += 1;
            }
        }
        finishes.sort((a, b) => a - b);
        const min = finishes[0], max = finishes[finishes.length - 1];
        const bucketSize = Math.max(1, Math.ceil((max - min + 1) / 16));
        const histogram = Array.from({ length: Math.min(16, Math.ceil((max - min + 1) / bucketSize)) }, (_, i) => {
            const from = min + i * bucketSize, to = Math.min(max, from + bucketSize - 1);
            let count = 0;
            for (const [d, n] of finishBuckets)
                if (d >= from && d <= to)
                    count += n;
            return { fromDays: from, toDays: to, probabilityPct: Math.round(count / iterations * 1000) / 10 };
        });
        const p50 = percentile(finishes, .5), p80 = percentile(finishes, .8), p90 = percentile(finishes, .9), p95 = percentile(finishes, .95);
        const mean = Math.round((sumY / iterations) * 10) / 10;
        const totalAbsCorrelation = Math.max(0.0001, simTasks.reduce((sum, t) => {
            const st = stats.get(t.id);
            return sum + Math.abs(correlation(st.sumX, sumY, st.sumXX, sumYY, st.sumXY, st.total));
        }, 0));
        const riskAttribution = simTasks.map((t) => {
            const st = stats.get(t.id);
            const corr = correlation(st.sumX, sumY, st.sumXX, sumYY, st.sumXY, st.total);
            return {
                taskId: t.id,
                taskName: byId.get(t.id)?.name || t.id,
                contributionPct: Math.round(Math.abs(corr) / totalAbsCorrelation * 1000) / 10,
                finishCorrelation: Math.round(corr * 1000) / 1000,
                criticalityPct: Math.round(st.critical / Math.max(1, st.total) * 1000) / 10,
                signal: Math.abs(corr) >= 0.5 ? "HIGH SENSITIVITY" : Math.abs(corr) >= 0.25 ? "WATCH" : "LOW SENSITIVITY",
            };
        }).sort((a, b) => b.contributionPct - a.contributionPct).slice(0, 10);
        const targetDates = tasks.map(t => t.targetDate?.getTime()).filter((x) => typeof x === "number");
        const targetDate = targetDates.length ? Math.min(...targetDates) : null;
        const targetDays = targetDate === null ? null : Math.max(0, Math.round((targetDate - forecastOrigin) / DAY_MS));
        const targetConfidencePct = targetDays === null ? null : Math.round(finishes.filter(d => d <= targetDays).length / iterations * 1000) / 10;
        const result = {
            projectId: id,
            iterations,
            uncertaintyPct: Math.round(uncertainty * 100),
            finish: {
                p50Days: p50, p80Days: p80, p90Days: p90, p95Days: p95, meanDays: mean,
                p50Date: new Date(forecastOrigin + p50 * DAY_MS).toISOString(),
                p80Date: new Date(forecastOrigin + p80 * DAY_MS).toISOString(),
                p90Date: new Date(forecastOrigin + p90 * DAY_MS).toISOString(),
                p95Date: new Date(forecastOrigin + p95 * DAY_MS).toISOString(),
                targetDate: targetDate === null ? null : new Date(targetDate).toISOString(),
                targetConfidencePct,
                forecastOrigin: new Date(forecastOrigin).toISOString(),
            },
            histogram,
            riskAttribution,
            interpretation: `Simulated ${iterations.toLocaleString()} futures from the live deterministic schedule using the same dependency graph and FS/SS/FF/SF semantics. Forecast origin is ${new Date(forecastOrigin).toISOString().slice(0, 10)}. P80 is the planning commitment view; P90/P95 expose contingency. Risk drivers use simulation-derived finish-date sensitivity and criticality rather than simple task-duration share.${targetConfidencePct === null ? " No target date is configured." : ` Target confidence is ${targetConfidencePct}%.`}`,
        };
        await db_1.prisma.forecastRun.create({ data: { projectId: id, iterations, uncertaintyPct: Math.round(uncertainty * 100), result } });
        return result;
    });
    app.get("/projects/:id/forecast-runs", { preHandler: (0, auth_1.requireScope)("forecast:read") }, async (req, reply) => {
        const { id } = req.params;
        const project = await db_1.prisma.project.findFirst({ where: { id, organizationId: req.organizationId } });
        if (!project)
            return reply.code(404).send({ error: "Project not found" });
        return db_1.prisma.forecastRun.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, take: 20 });
    });
}
//# sourceMappingURL=simulation.js.map