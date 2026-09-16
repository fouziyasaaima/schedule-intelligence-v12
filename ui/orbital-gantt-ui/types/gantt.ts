export type TaskType = "SUMMARY" | "TASK" | "MILESTONE";
export type TaskStatus = "ACTIVE" | "ON_HOLD" | "CLOSED" | "DELAYED";
export type DependencyType =
  | "FINISH_TO_START"
  | "START_TO_START"
  | "FINISH_TO_FINISH"
  | "START_TO_FINISH";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  status: "ACTIVE" | "ON_HOLD" | "CLOSED";
  taskCount?: number;
  criticalTaskCount?: number;
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  taskType: TaskType;
  name: string;
  description: string | null;
  expectedStart: string;
  expectedEnd: string;
  durationDays: number;
  actualStart: string | null;
  actualEnd: string | null;
  targetDate: string | null;
  targetFeasible: boolean | null;
  progressPct: number;
  status: TaskStatus;
  isManualSchedule: boolean;
  sortOrder: number;
  // computed, present on reads
  isCritical: boolean | null;
  slackDays: number | null;
}

export interface Dependency {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  dependencyType: DependencyType;
  lagDays: number;
  isActive: boolean;
}

export interface Resource {
  id: string;
  name: string;
  role: string | null;
  capacityHoursPerDay: number;
}

export interface ExplainResult {
  taskId: string;
  expectedStart: string;
  expectedEnd: string;
  isCritical: boolean | null;
  slackDays: number | null;
  reasoning: string;
}

export interface TargetResult {
  taskId: string;
  targetDate: string | null;
  computedFinish: string;
  targetFeasible: boolean | null;
  slipDays: number | null;
}
