import { DependencyType } from "@prisma/client";

const DAY_MS = 86_400_000;

export interface CpmTaskInput {
  id: string;
  expectedStart: Date;
  expectedEnd: Date;
  durationDays: number;
  isManualSchedule: boolean;
  targetDate: Date | null;
}

export interface CpmDependencyInput {
  predecessorId: string;
  successorId: string;
  dependencyType: DependencyType;
  lagDays: number;
  isActive: boolean;
}

export interface CpmTaskResult {
  id: string;
  expectedStart: Date;
  expectedEnd: Date;
  earlyStart: Date;
  earlyFinish: Date;
  lateStart: Date;
  lateFinish: Date;
  slackDays: number;
  isCritical: boolean;
  targetFeasible: boolean | null;
}

export interface DependencyGraphAnalysis {
  order: string[];
  cycleTaskIds: string[];
  cyclePathIds: string[];
}

const toDay = (d: Date) => Math.floor(d.getTime() / DAY_MS);
const fromDay = (n: number) => new Date(n * DAY_MS);

/**
 * Canonical graph analysis used by CPM, Monte Carlo and validation. Keeping one
 * graph implementation prevents the UI from seeing a healthy graph while a
 * different engine rejects it as cyclic.
 */
export function analyzeDependencyGraph(
  tasks: Array<{ id: string; expectedStart?: Date }>,
  dependencies: CpmDependencyInput[],
): DependencyGraphAnalysis {
  const ids = new Set(tasks.map((t) => t.id));
  const active = dependencies.filter(
    (d) => d.isActive && ids.has(d.predecessorId) && ids.has(d.successorId),
  );
  const indegree = new Map(tasks.map((t) => [t.id, 0]));
  const outgoing = new Map<string, CpmDependencyInput[]>();
  for (const t of tasks) outgoing.set(t.id, []);
  for (const d of active) {
    indegree.set(d.successorId, (indegree.get(d.successorId) || 0) + 1);
    outgoing.get(d.predecessorId)!.push(d);
  }
  const queue = tasks
    .filter((t) => (indegree.get(t.id) || 0) === 0)
    .sort((a, b) => toDay(a.expectedStart || new Date(0)) - toDay(b.expectedStart || new Date(0)))
    .map((t) => t.id);
  const order: string[] = [];
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    order.push(id);
    for (const d of outgoing.get(id) || []) {
      const next = (indegree.get(d.successorId) || 0) - 1;
      indegree.set(d.successorId, next);
      if (next === 0) queue.push(d.successorId);
    }
  }
  const orderedIds = new Set(order);
  const cycleTaskIds = tasks.filter((t) => !orderedIds.has(t.id)).map((t) => t.id);

  // Return a useful concrete loop, rather than only an unordered set of nodes.
  const adjacency = new Map<string, string[]>();
  for (const d of active) adjacency.set(d.predecessorId, [...(adjacency.get(d.predecessorId) || []), d.successorId]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  let cyclePathIds: string[] = [];
  const dfs = (id: string): boolean => {
    visiting.add(id); stack.push(id);
    for (const next of adjacency.get(id) || []) {
      if (visiting.has(next)) {
        const at = stack.indexOf(next);
        cyclePathIds = [...stack.slice(at), next];
        return true;
      }
      if (!visited.has(next) && dfs(next)) return true;
    }
    stack.pop(); visiting.delete(id); visited.add(id);
    return false;
  };
  for (const t of tasks) if (!visited.has(t.id) && dfs(t.id)) break;

  return { order, cycleTaskIds, cyclePathIds };
}

export function computeSchedule(tasks: CpmTaskInput[], dependencies: CpmDependencyInput[]): Map<string, CpmTaskResult> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const results = new Map<string, CpmTaskResult>();
  if (!tasks.length) return results;

  const active = dependencies.filter((d) => d.isActive && byId.has(d.predecessorId) && byId.has(d.successorId));
  const incoming = new Map<string, CpmDependencyInput[]>();
  const outgoing = new Map<string, CpmDependencyInput[]>();
  tasks.forEach((t) => { incoming.set(t.id, []); outgoing.set(t.id, []); });
  active.forEach((d) => { incoming.get(d.successorId)!.push(d); outgoing.get(d.predecessorId)!.push(d); });

  const graph = analyzeDependencyGraph(tasks, active);
  if (graph.cycleTaskIds.length) {
    const error = new Error(
      graph.cyclePathIds.length
        ? `The dependency graph contains a cycle: ${graph.cyclePathIds.join(" → ")}.`
        : "The dependency graph contains a cycle. Remove the circular dependency before recomputing.",
    );
    (error as any).code = "SCHEDULE_CYCLE";
    (error as any).cycleTaskIds = graph.cycleTaskIds;
    (error as any).cyclePathIds = graph.cyclePathIds;
    throw error;
  }

  const duration = (id: string) => Math.max(1, byId.get(id)!.durationDays);
  const es: Record<string, number> = {};
  const ef: Record<string, number> = {};
  const newStartDay: Record<string, number> = {};

  const constraintStart = (d: CpmDependencyInput): number => {
    const predEs = es[d.predecessorId];
    const predEf = ef[d.predecessorId];
    const succDur = duration(d.successorId);
    switch (d.dependencyType) {
      case "START_TO_START": return predEs + d.lagDays;
      case "FINISH_TO_FINISH": return predEf + d.lagDays - succDur;
      case "START_TO_FINISH": return predEs + d.lagDays - succDur;
      default: return predEf + d.lagDays;
    }
  };

  graph.order.forEach((id) => {
    const t = byId.get(id)!;
    const incomingDeps = incoming.get(id) || [];
    // A date is a user's preferred anchor. Active dependencies are hard schedule
    // constraints: when a relationship exists, the engine propagates the earliest
    // legal date even if the task was previously entered manually. This makes the
    // Gantt behave like a real dependency-driven scheduler instead of a static chart.
    // Once a task has an incoming dependency, its schedule is driven by the
    // dependency constraints rather than by the task's previous placement.
    // This makes a zero-lag SS relationship visibly align both starts, and
    // ensures moving a predecessor can move a dependency-driven successor in
    // either direction. Root tasks (with no predecessors) retain their own
    // manually-entered date as the scheduling anchor.
    let start = incomingDeps.length ? Number.NEGATIVE_INFINITY : toDay(t.expectedStart);
    for (const d of incomingDeps) {
      if (es[d.predecessorId] !== undefined) start = Math.max(start, constraintStart(d));
    }
    if (!Number.isFinite(start)) start = toDay(t.expectedStart);
    es[id] = start;
    ef[id] = es[id] + duration(id);
    newStartDay[id] = start;
  });

  let projectEnd = Number.NEGATIVE_INFINITY;
  for (const t of tasks) {
    projectEnd = Math.max(projectEnd, ef[t.id] ?? duration(t.id));
  }
  const lf: Record<string, number> = {};
  const ls: Record<string, number> = {};
  const constraintFinish = (d: CpmDependencyInput): number => {
    const succLs = ls[d.successorId];
    const succLf = lf[d.successorId];
    const predDur = duration(d.predecessorId);
    switch (d.dependencyType) {
      case "START_TO_START": return succLs - d.lagDays + predDur;
      case "FINISH_TO_FINISH": return succLf - d.lagDays;
      case "START_TO_FINISH": return succLf - d.lagDays + predDur;
      default: return succLs - d.lagDays;
    }
  };
  [...graph.order].reverse().forEach((id) => {
    let finish = projectEnd;
    for (const d of outgoing.get(id) || []) {
      if (ls[d.successorId] === undefined && lf[d.successorId] === undefined) continue;
      finish = Math.min(finish, constraintFinish(d));
    }
    lf[id] = finish;
    ls[id] = finish - duration(id);
  });

  tasks.forEach((t) => {
    const slack = Math.max(0, ls[t.id] - es[t.id]);
    const hasIncomingDependency = (incoming.get(t.id) || []).length > 0;
    const finalStartDay = hasIncomingDependency ? newStartDay[t.id] : toDay(t.expectedStart);
    const finalEndDay = finalStartDay + duration(t.id);
    const targetFeasible = t.targetDate ? finalEndDay <= toDay(t.targetDate) : null;
    results.set(t.id, {
      id: t.id,
      expectedStart: fromDay(finalStartDay),
      expectedEnd: fromDay(finalEndDay),
      earlyStart: fromDay(es[t.id]),
      earlyFinish: fromDay(ef[t.id]),
      lateStart: fromDay(ls[t.id]),
      lateFinish: fromDay(lf[t.id]),
      slackDays: slack,
      isCritical: slack <= 0,
      targetFeasible,
    });
  });
  return results;
}

export function directSuccessors(taskId: string, dependencies: CpmDependencyInput[]): string[] {
  return dependencies.filter((d) => d.isActive && d.predecessorId === taskId && d.dependencyType === "FINISH_TO_START").map((d) => d.successorId);
}
