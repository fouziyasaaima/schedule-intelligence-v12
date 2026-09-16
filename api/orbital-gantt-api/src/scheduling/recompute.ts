import { PrismaClient, Prisma } from "@prisma/client";
import { computeSchedule, CpmTaskInput, CpmDependencyInput } from "./cpm";

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
export async function recomputeProjectSchedule(prisma: PrismaClient, projectId: string) {
  const [tasks, dependencies] = await Promise.all([
    prisma.task.findMany({ where: { projectId } }),
    prisma.dependency.findMany({ where: { projectId, isActive: true } }),
  ]);

  const cpmTasks: CpmTaskInput[] = tasks.map((t) => ({
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

  await prisma.$transaction(
    Array.from(results.values()).flatMap((r) => {
      const original = tasks.find((t) => t.id === r.id)!;
      // The computed schedule is authoritative for dependency-constrained work.
      // Manual dates are still honored as the task's lower-bound anchor by CPM,
      // but downstream constraints are allowed to move the task when required.
      const datesChanged =
        original.expectedStart.getTime() !== r.expectedStart.getTime() ||
        original.expectedEnd.getTime() !== r.expectedEnd.getTime();

      const ops: Prisma.PrismaPromise<unknown>[] = [
        prisma.scheduleResult.upsert({
          where: { taskId: r.id },
          create: {
            taskId: r.id,
            earlyStart: r.earlyStart,
            earlyFinish: r.earlyFinish,
            lateStart: r.lateStart,
            lateFinish: r.lateFinish,
            slackDays: r.slackDays,
            isCritical: r.isCritical,
          },
          update: {
            earlyStart: r.earlyStart,
            earlyFinish: r.earlyFinish,
            lateStart: r.lateStart,
            lateFinish: r.lateFinish,
            slackDays: r.slackDays,
            isCritical: r.isCritical,
            computedAt: new Date(),
          },
        }),
      ];

      if (datesChanged || original.targetFeasible !== r.targetFeasible) {
        ops.push(
          prisma.task.update({
            where: { id: r.id },
            data: {
              ...(datesChanged
                ? { expectedStart: r.expectedStart, expectedEnd: r.expectedEnd }
                : {}),
              targetFeasible: r.targetFeasible,
            },
          })
        );
      }

      return ops;
    })
  );

  return results;
}
