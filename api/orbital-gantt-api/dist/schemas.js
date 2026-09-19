"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scenarioImpactSchema = exports.scenarioSchema = exports.scenarioChangeSchema = exports.createAssignmentSchema = exports.updateResourceSchema = exports.createResourceSchema = exports.resourceTypeSchema = exports.createDependencySchema = exports.updateTaskSchema = exports.createTaskSchema = exports.updateProjectSchema = exports.createProjectSchema = void 0;
const zod_1 = require("zod");
exports.createProjectSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    startDate: zod_1.z.coerce.date(),
});
exports.updateProjectSchema = exports.createProjectSchema.partial().extend({
    status: zod_1.z.enum(["ACTIVE", "ON_HOLD", "CLOSED"]).optional(),
});
exports.createTaskSchema = zod_1.z.object({
    parentId: zod_1.z.string().optional(),
    taskType: zod_1.z.enum(["SUMMARY", "TASK", "MILESTONE"]).default("TASK"),
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    // Direct date input (typed) works identically to a drag-derived value —
    // both just PATCH these same fields.
    expectedStart: zod_1.z.coerce.date(),
    expectedEnd: zod_1.z.coerce.date(),
    targetDate: zod_1.z.coerce.date().optional(),
    sortOrder: zod_1.z.number().int().optional(),
});
exports.updateTaskSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().optional(),
    expectedStart: zod_1.z.coerce.date().optional(),
    expectedEnd: zod_1.z.coerce.date().optional(),
    actualStart: zod_1.z.coerce.date().nullable().optional(),
    actualEnd: zod_1.z.coerce.date().nullable().optional(),
    targetDate: zod_1.z.coerce.date().nullable().optional(),
    progressPct: zod_1.z.number().int().min(0).max(100).optional(),
    status: zod_1.z.enum(["ACTIVE", "ON_HOLD", "CLOSED", "DELAYED"]).optional(),
    // Explicit override; normally set automatically the moment a date is typed/dragged.
    isManualSchedule: zod_1.z.boolean().optional(),
    sortOrder: zod_1.z.number().int().optional(),
});
exports.createDependencySchema = zod_1.z.object({
    predecessorId: zod_1.z.string().min(1),
    successorId: zod_1.z.string().min(1),
    dependencyType: zod_1.z
        .enum(["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"])
        .default("FINISH_TO_START"),
    lagDays: zod_1.z.number().int().default(0),
});
exports.resourceTypeSchema = zod_1.z.enum(["PERSON", "EQUIPMENT", "FACILITY", "VEHICLE", "MATERIAL", "TEAM", "OTHER"]);
exports.createResourceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(180),
    role: zod_1.z.string().max(120).optional(),
    type: exports.resourceTypeSchema.default("PERSON"),
    capacityHoursPerDay: zod_1.z.number().positive().max(24).default(8),
    capacityUnits: zod_1.z.number().positive().max(100000).default(1),
    unitLabel: zod_1.z.string().min(1).max(40).default("unit"),
    availabilityPct: zod_1.z.number().int().min(0).max(100).default(100),
    isActive: zod_1.z.boolean().default(true),
    projectId: zod_1.z.string().min(1).optional(),
});
exports.updateResourceSchema = exports.createResourceSchema.omit({ projectId: true }).partial();
exports.createAssignmentSchema = zod_1.z.object({
    resourceId: zod_1.z.string().min(1),
    allocationPct: zod_1.z.number().int().min(1).max(100).optional(),
    units: zod_1.z.number().positive().optional(),
    role: zod_1.z.string().max(120).optional(),
});
exports.scenarioChangeSchema = zod_1.z.object({
    taskId: zod_1.z.string().min(1),
    expectedStart: zod_1.z.coerce.date().optional(),
    expectedEnd: zod_1.z.coerce.date().optional(),
    durationDays: zod_1.z.number().int().min(1).optional(),
}).superRefine((value, ctx) => {
    if (value.expectedStart && value.expectedEnd && value.expectedEnd < value.expectedStart) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ["expectedEnd"], message: "expectedEnd cannot be before expectedStart" });
    }
});
exports.scenarioSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(120).optional(),
    description: zod_1.z.string().max(2000).optional(),
    changes: zod_1.z.array(exports.scenarioChangeSchema).max(200).default([]),
});
exports.scenarioImpactSchema = zod_1.z.object({
    changes: zod_1.z.array(exports.scenarioChangeSchema).min(1).max(200),
});
//# sourceMappingURL=schemas.js.map