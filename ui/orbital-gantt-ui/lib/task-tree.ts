import type { Task } from "@/types/gantt";

export type TreeTask = Task & { depth: number; hasChildren: boolean };

/** Stable parent/child projection used by both the sidebar and timeline. */
export function buildVisibleTaskTree(tasks: Task[], collapsedIds: Set<string>): TreeTask[] {
  const byParent = new Map<string | null, Task[]>();
  const ids = new Set(tasks.map(t => t.id));
  for (const task of tasks) {
    const parent = task.parentId && ids.has(task.parentId) ? task.parentId : null;
    const list = byParent.get(parent) ?? [];
    list.push(task);
    byParent.set(parent, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.expectedStart.localeCompare(b.expectedStart) || a.name.localeCompare(b.name));

  const result: TreeTask[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const task of byParent.get(parentId) ?? []) {
      if (visited.has(task.id)) continue;
      visited.add(task.id);
      const children = byParent.get(task.id) ?? [];
      result.push({ ...task, depth, hasChildren: children.length > 0 });
      if (!collapsedIds.has(task.id)) walk(task.id, depth + 1);
    }
  };
  walk(null, 0);
  // A corrupt/cyclic hierarchy must never make tasks disappear.
  for (const task of tasks) if (!visited.has(task.id)) result.push({ ...task, depth: 0, hasChildren: (byParent.get(task.id) ?? []).length > 0 });
  return result;
}
