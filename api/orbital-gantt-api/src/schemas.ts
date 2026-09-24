import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.coerce.date(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(["ACTIVE", "ON_HOLD", "CLOSED"]).optional(),
});

export const createTaskSchema = z.object({
  parentId: z.string().optional(),
  taskType: z.enum(["SUMMARY", "TASK", "MILESTONE"]).default("TASK"),
  name: z.string().min(1),
  description: z.string().optional(),
  // Direct date input (typed) works identically to a drag-derived value —
  // both just PATCH these same fields.
  expectedStart: z.coerce.date(),
  expectedEnd: z.coerce.date(),
  targetDate: z.coerce.date().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateTaskSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  expectedStart: z.coerce.date().optional(),
  expectedEnd: z.coerce.date().optional(),
  actualStart: z.coerce.date().nullable().optional(),
  actualEnd: z.coerce.date().nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "CLOSED", "DELAYED"]).optional(),
  // Explicit override; normally set automatically the moment a date is typed/dragged.
  isManualSchedule: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const createDependencySchema = z.object({
  predecessorId: z.string().min(1),
  successorId: z.string().min(1),
  dependencyType: z
    .enum(["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"])
    .default("FINISH_TO_START"),
  lagDays: z.number().int().default(0),
});

export const resourceTypeSchema = z.enum(["PERSON", "EQUIPMENT", "FACILITY", "VEHICLE", "MATERIAL", "TEAM", "OTHER"]);

export const createResourceSchema = z.object({
  name: z.string().min(1).max(180),
  role: z.string().max(120).optional(),
  type: resourceTypeSchema.default("PERSON"),
  capacityHoursPerDay: z.number().positive().max(24).default(8),
  capacityUnits: z.number().positive().max(100000).default(1),
  unitLabel: z.string().min(1).max(40).default("unit"),
  availabilityPct: z.number().int().min(0).max(100).default(100),
  isActive: z.boolean().default(true),
  projectId: z.string().min(1).optional(),
});

export const updateResourceSchema = createResourceSchema.omit({ projectId: true }).partial();

export const createAssignmentSchema = z.object({
  resourceId: z.string().min(1),
  allocationPct: z.number().int().min(1).max(100).optional(),
  units: z.number().positive().optional(),
  role: z.string().max(120).optional(),
});

export const scenarioChangeSchema = z.object({
  taskId: z.string().min(1),
  expectedStart: z.coerce.date().optional(),
  expectedEnd: z.coerce.date().optional(),
  durationDays: z.number().int().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.expectedStart && value.expectedEnd && value.expectedEnd < value.expectedStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedEnd"], message: "expectedEnd cannot be before expectedStart" });
  }
});

export const scenarioSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  changes: z.array(scenarioChangeSchema).max(200).default([]),
});

export const scenarioImpactSchema = z.object({
  changes: z.array(scenarioChangeSchema).min(1).max(200),
});
