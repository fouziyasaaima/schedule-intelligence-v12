import { PrismaClient, Prisma } from "@prisma/client";
import { computeSchedule, CpmTaskInput, CpmDependencyInput } from "./cpm";

const DAY_MS = 86_400_000;

/**
 * Recomputes the full schedule for a project: runs CPM over every task +
 * active dependency, persists derived early/late/slack/critical fields to
 * ScheduleResult, and writes back expectedStart/expectedEnd + targetFeasible
 * for any task constrained by an active dependency whose dates moved as a result.
 *
 * This is the single choke point every mutation (task edit, dependency
 * change, drag, typed date, target date set) should call through — it is
 * intentionally the only place that writes ScheduleResult or auto-adjusts
 * expectedStart/expectedEnd.
 */
async function deriveSummaryDates(prisma: PrismaClient, tasks: any[]) {
  const byParent = new Map<string, any[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const list = byParent.get(task.parentId) ?? [];
    list.push(task);
    byParent.set(task.parentId, list);
  }

  const derived = new Map<string, { expectedStart: Date; expectedEnd: Date; actualStart: Date | null; actualEnd: Date | null; durationDays: number }>();
  const visiting = new Set<string>();

  const visit = (id: string): { expectedStart: Date; expectedEnd: Date; actualStart: Date | null; actualEnd: Date | null } | null => {
    const children = byParent.get(id) ?? [];
    if (!children.length) return null;
    if (visiting.has(id)) return null; // protect against a corrupt hierarchy cycle
    visiting.add(id);

    const ranges = children.map(child => visit(child.id) ?? {
      expectedStart: child.expectedStart,
      expectedEnd: child.expectedEnd,
      actualStart: child.actualStart,
      actualEnd: child.actualEnd,
    });

    visiting.delete(id);
    const expectedStart = new Date(Math.min(...ranges.map(r => r.expectedStart.getTime())));
    const expectedEnd = new Date(Math.max(...ranges.map(r => r.expectedEnd.getTime())));
    const actualStarts = ranges.map(r => r.actualStart).filter((d): d is Date => !!d);
    const actualStart = actualStarts.length ? new Date(Math.min(...actualStarts.map(d => d.getTime()))) : null;
    // A summary remains ongoing while any descendant is still ongoing.
    const actualEnd = ranges.every(r => !!r.actualEnd)
      ? new Date(Math.max(...ranges.map(r => r.actualEnd!.getTime())))
      : null;
    derived.set(id, {
      expectedStart,
      expectedEnd,
      actualStart,
      actualEnd,
      durationDays: Math.max(1, Math.round((expectedEnd.getTime() - expectedStart.getTime()) / DAY_MS)),
    });
    return { expectedStart, expectedEnd, actualStart, actualEnd };
  };

  for (const task of tasks) if (byParent.has(task.id)) visit(task.id);
  return derived;
}

export async function recomputeProjectSchedule(prisma: PrismaClient, projectId: string) {
  const [tasks, dependencies] = await Promise.all([
    prisma.task.findMany({ where: { projectId } }),
    prisma.dependency.findMany({ where: { projectId, isActive: true } }),
  ]);

  const summaryDates = await deriveSummaryDates(prisma, tasks);
  const effectiveTasks = tasks.map(t => {
    const d = summaryDates.get(t.id);
    return d ? { ...t, expectedStart: d.expectedStart, expectedEnd: d.expectedEnd, durationDays: d.durationDays, actualStart: d.actualStart, actualEnd: d.actualEnd, taskType: "SUMMARY" as const } : t;
  });

  const cpmTasks: CpmTaskInput[] = effectiveTasks.map((t) => ({
    id: t.id,
    expectedStart: t.expectedStart,
    expectedEnd: t.expectedEnd,
    durationDays: t.durationDays,
    isManualSchedule: t.isManualSchedule,
    targetDate: t.targetDate,
  }));

  const cpmDeps: CpmDependencyInput[] = dependencies.map((d) => ({
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    dependencyType: d.dependencyType,
    lagDays: d.lagDays,
    isActive: d.isActive,
  }));

  const results = computeSchedule(cpmTasks, cpmDeps);

  // Dependency scheduling can move a child after CPM. Re-derive summary
  // dates from the resulting child dates so parent/grandparent ranges remain
  // exact after both direct edits and dependency-driven moves.
  const postScheduleTasks = effectiveTasks.map(t => {
    const r = results.get(t.id);
    return r ? { ...t, expectedStart: r.expectedStart, expectedEnd: r.expectedEnd, durationDays: Math.max(1, Math.round((r.expectedEnd.getTime() - r.expectedStart.getTime()) / DAY_MS)) } : t;
  });
  const postSummaryDates = await deriveSummaryDates(prisma, postScheduleTasks);
  for (const [id, d] of postSummaryDates) {
    const r = results.get(id);
    if (r) {
      r.expectedStart = d.expectedStart;
      r.expectedEnd = d.expectedEnd;
    }
  }

  await prisma.$transaction(
    Array.from(results.values()).flatMap((r) => {
      const original = tasks.find((t) => t.id === r.id)!;
      const summary = postSummaryDates.get(r.id) ?? summaryDates.get(r.id);
      const derived = summary ? { ...summary, actualStart: summary.actualStart, actualEnd: summary.actualEnd } : null;
      const datesChanged =
        original.expectedStart.getTime() !== r.expectedStart.getTime() ||
        original.expectedEnd.getTime() !== r.expectedEnd.getTime();
      const actualChanged = derived && (
        (original.actualStart?.getTime() ?? null) !== (derived.actualStart?.getTime() ?? null) ||
        (original.actualEnd?.getTime() ?? null) !== (derived.actualEnd?.getTime() ?? null)
      );
      const typeChanged = summary && original.taskType !== "SUMMARY";
      const ops: Prisma.PrismaPromise<unknown>[] = [
        prisma.scheduleResult.upsert({
          where: { taskId: r.id },
          create: { taskId: r.id, earlyStart: r.earlyStart, earlyFinish: r.earlyFinish, lateStart: r.lateStart, lateFinish: r.lateFinish, slackDays: r.slackDays, isCritical: r.isCritical },
          update: { earlyStart: r.earlyStart, earlyFinish: r.earlyFinish, lateStart: r.lateStart, lateFinish: r.lateFinish, slackDays: r.slackDays, isCritical: r.isCritical, computedAt: new Date() },
        }),
      ];
      if (datesChanged || actualChanged || typeChanged || original.targetFeasible !== r.targetFeasible) {
        ops.push(prisma.task.update({
          where: { id: r.id },
          data: {
            ...(datesChanged ? { expectedStart: r.expectedStart, expectedEnd: r.expectedEnd } : {}),
            ...(derived && actualChanged ? { actualStart: derived.actualStart, actualEnd: derived.actualEnd } : {}),
            ...(typeChanged ? { taskType: "SUMMARY" } : {}),
            targetFeasible: r.targetFeasible,
            ...(derived ? { durationDays: derived.durationDays } : {}),
          },
        }));
      }
      return ops;
    })
  );

  return results;
}
