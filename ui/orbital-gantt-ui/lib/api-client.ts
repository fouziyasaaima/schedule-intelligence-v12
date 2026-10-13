import type { Project, Task, Dependency, Resource, ExplainResult, TargetResult } from "@/types/gantt";
import { notify } from "@/lib/notifications";

export interface ApiConfig {
  baseUrl: string;
  authToken?: string;
  embedded?: boolean;
  embedProjectId?: string;
}

export type Connector = { id:string; name:string; provider:string; baseUrl:string; authType:string; status:string; direction:string; config:any; lastTestedAt?:string|null; lastSyncAt?:string|null; lastError?:string|null; mappings?:ConnectorMapping[]; };
export type ConnectorHealth = { id:string; name:string; status:string; lastSyncAt?:string|null; lastTestedAt?:string|null; lastError?:string|null; direction:string; provider:string; pendingEvents:number; deadLetterEvents:number; openConflicts:number; lastRun?:any|null; };
export type ConnectorMapping = { id:string; entityType:string; externalField:string; internalField:string; direction:string; transform:any; required:boolean; };

class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) { super(message); this.name="ApiError"; }
}

async function request<T>(config: ApiConfig, path: string, init?: RequestInit): Promise<T> {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  // In embedded mode the signed sie_ token is authoritative. Normalize every
  // project-scoped client request to that canonical SI project id, regardless
  // of whether a caller still holds the PRMS/external project id.
  let effectivePath = path;
  if (config.embedded && config.embedProjectId) {
    const match = path.match(/^(\/v1\/projects\/)([^/]+)(.*)$/);
    if (match) effectivePath = `${match[1]}${encodeURIComponent(config.embedProjectId)}${match[3]}`;
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${baseUrl}${effectivePath}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      credentials: "include",
      headers: {
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        Accept: "application/json",
        ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      const detail = body.code ? ` [${body.code}]` : "";
      const message = `${body.error || `Request failed: ${res.status}`}${detail}`;
      notify({ kind: res.status >= 500 ? "error" : "warning", title: "Action could not be completed", message, id: `api-error:${init?.method || "GET"}:${effectivePath}:${body.code || res.status}` });
      throw new ApiError(res.status, message, body.code, body);
    }
    if (res.status === 204) {
      if (init?.method && init.method !== "GET") notify({ kind: "success", title: actionLabel(init.method, path), message: "The change was saved successfully." });
      return undefined as T;
    }
    const result = await res.json() as T;
    if (init?.method && init.method !== "GET") notify({ kind: "success", title: actionLabel(init.method, path), message: "The change was saved successfully." });
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      const message = `Schedule Intelligence API request timed out after 20 seconds.`;
      notify({ kind: "error", title: "Action timed out", message });
      throw new TypeError(`${message} ${baseUrl}${effectivePath}`);
    }
    const message = `Unable to reach Schedule Intelligence API. ${error instanceof Error ? error.message : "Network request failed."}`;
    notify({ kind: "error", title: "Connection problem", message });
    throw new TypeError(`${message} ${baseUrl}`);
  } finally {
    window.clearTimeout(timeout);
  }
}


function actionLabel(method: string, path: string) {
  const p = path.toLowerCase();
  if (method === "POST" && p.includes("dependencies")) return "Dependency created";
  if (method === "PATCH" && p.includes("dependencies")) return "Dependency updated";
  if (method === "DELETE" && p.includes("dependencies")) return "Dependency removed";
  if (method === "POST" && p.includes("simulations")) return "Forecast completed";
  if (method === "POST" && p.includes("recompute")) return "Schedule recomputed";
  if (method === "POST" && p.includes("scenarios")) return "Scenario saved";
  if (method === "POST" && p.includes("assignments")) return "Resource assignment saved";
  if (method === "DELETE" && p.includes("assignments")) return "Resource assignment removed";
  if (method === "POST" && p.includes("resources")) return "Resource created";
  if (method === "DELETE" && p.includes("resources")) return "Resource removed";
  if (method === "POST" && p.includes("tasks")) return "Task created";
  if (method === "PATCH" && p.includes("tasks")) return "Task updated";
  if (method === "DELETE" && p.includes("tasks")) return "Task deleted";
  if (method === "POST" && p.includes("projects")) return "Project created";
  return "Change completed";
}

export const connectorApi = {
  list:(c:ApiConfig)=>request<Connector[]>(c,"/v1/connectors"),
  prmsStatus:(c:ApiConfig)=>request<{configured:boolean;baseUrl:string;tokenUrl:string;missing:string[]}>(c,"/v1/connectors/providers/prms/status"),
  prmsSchedule:(c:ApiConfig,id:string)=>request<any>(c,`/v1/connectors/${id}/prms/schedule`),
  prmsOpenGantt:(c:ApiConfig,id:string)=>request<{projectId:string;externalProjectId:string;taskCount:number}>(c,`/v1/connectors/${id}/prms/open-gantt`,{method:"POST",body:JSON.stringify({})}),
  prmsExpectedDates:(c:ApiConfig,id:string,body:{id:number;isAction:boolean;startDate:string;endDate:string})=>request<any>(c,`/v1/connectors/${id}/prms/expected-dates`,{method:"PUT",body:JSON.stringify(body)}),
  prmsUsers:(c:ApiConfig,id:string)=>request<any[]>(c,`/v1/connectors/${id}/prms/users`),
  prmsPublishPreview:(c:ApiConfig,id:string,body:any)=>request<any>(c,`/v1/connectors/${id}/prms/publish-preview`,{method:"POST",body:JSON.stringify(body)}),
  prmsPublish:(c:ApiConfig,id:string,body:any)=>request<any>(c,`/v1/connectors/${id}/prms/publish`,{method:"POST",body:JSON.stringify(body)}),
  get:(c:ApiConfig,id:string)=>request<Connector>(c,`/v1/connectors/${id}`),
  create:(c:ApiConfig,body:any)=>request<Connector>(c,"/v1/connectors",{method:"POST",body:JSON.stringify(body)}),
  update:(c:ApiConfig,id:string,body:any)=>request<Connector>(c,`/v1/connectors/${id}`,{method:"PATCH",body:JSON.stringify(body)}),
  remove:(c:ApiConfig,id:string)=>request<void>(c,`/v1/connectors/${id}`,{method:"DELETE"}),
  test:(c:ApiConfig,id:string)=>request<any>(c,`/v1/connectors/${id}/test`,{method:"POST",body:JSON.stringify({})}),
  testWrite:(c:ApiConfig,id:string,operationKey:string,body:any)=>request<any>(c,`/v1/connectors/${id}/test-write`,{method:"POST",body:JSON.stringify({operationKey,body})}),
  importOpenApi:(c:ApiConfig,id:string,body:any)=>request<any>(c,`/v1/connectors/${id}/openapi/import`,{method:"POST",body:JSON.stringify(body)}),
  discover:(c:ApiConfig,id:string,operationKey:string,body:any={})=>request<any>(c,`/v1/connectors/${id}/discover`,{method:"POST",body:JSON.stringify({operationKey,...body})}),
  authorize:(c:ApiConfig,id:string)=>request<{url:string}>(c,`/v1/connectors/${id}/oauth/authorize`),
  credential:(c:ApiConfig,id:string)=>request<{hasCredential:boolean;hasAccessToken:boolean;authType:string}>(c,`/v1/connectors/${id}/credential`),
  googleSpreadsheets:(c:ApiConfig,id:string,q="")=>request<{files:Array<{id:string;name:string;mimeType:string;modifiedTime?:string;webViewLink?:string}>}>(c,`/v1/connectors/${id}/google/spreadsheets${q?`?q=${encodeURIComponent(q)}`:""}`),
  googleSpreadsheet:(c:ApiConfig,id:string,spreadsheetId:string)=>request<{spreadsheetId:string;properties:{title:string};sheets:Array<{properties:{sheetId:number;title:string;index:number;gridProperties?:{rowCount:number;columnCount:number}}}>}>(c,`/v1/connectors/${id}/google/spreadsheets/${encodeURIComponent(spreadsheetId)}`),
  googleValues:(c:ApiConfig,id:string,spreadsheetId:string,range:string)=>request<{range?:string;majorDimension?:string;values?:string[][]}>(c,`/v1/connectors/${id}/google/spreadsheets/${encodeURIComponent(spreadsheetId)}/values?range=${encodeURIComponent(range)}`),
  microsoftWorkbooks:(c:ApiConfig,id:string,q="")=>request<{files:Array<{id:string;name:string;size?:number;lastModifiedDateTime?:string;webUrl?:string}>}>(c,`/v1/connectors/${id}/microsoft/workbooks${q?`?q=${encodeURIComponent(q)}`:""}`),
  microsoftWorkbook:(c:ApiConfig,id:string,itemId:string)=>request<{itemId:string;sheets:Array<{id:string;name:string;index?:number}>}>(c,`/v1/connectors/${id}/microsoft/workbooks/${encodeURIComponent(itemId)}`),
  microsoftValues:(c:ApiConfig,id:string,itemId:string,sheetId:string,address:string)=>request<any>(c,`/v1/connectors/${id}/microsoft/workbooks/${encodeURIComponent(itemId)}/values?sheetId=${encodeURIComponent(sheetId)}&address=${encodeURIComponent(address)}`),
  sync:(c:ApiConfig,id:string)=>request<any>(c,`/v1/connectors/${id}/sync`,{method:"POST",body:JSON.stringify({})}),
  health:(c:ApiConfig,id:string)=>request<ConnectorHealth>(c,`/v1/connectors/${id}/health`),
  events:(c:ApiConfig,id:string,status="")=>request<any[]>(c,`/v1/connectors/${id}/events${status?`?status=${encodeURIComponent(status)}`:""}`),
  conflicts:(c:ApiConfig,id:string,status="OPEN")=>request<any[]>(c,`/v1/connectors/${id}/conflicts?status=${encodeURIComponent(status)}`),
  resolveConflict:(c:ApiConfig,id:string,conflictId:string,resolution:string)=>request<any>(c,`/v1/connectors/${id}/conflicts/${conflictId}/resolve`,{method:"POST",body:JSON.stringify({resolution})}),
  runs:(c:ApiConfig,id:string)=>request<any[]>(c,`/v1/connectors/${id}/sync-runs`),
  addMapping:(c:ApiConfig,id:string,body:any)=>request<ConnectorMapping>(c,`/v1/connectors/${id}/mappings`,{method:"POST",body:JSON.stringify(body)}),
  updateMapping:(c:ApiConfig,id:string,mappingId:string,body:any)=>request<ConnectorMapping>(c,`/v1/connectors/${id}/mappings/${mappingId}`,{method:"PATCH",body:JSON.stringify(body)}),
  removeMapping:(c:ApiConfig,id:string,mappingId:string)=>request<void>(c,`/v1/connectors/${id}/mappings/${mappingId}`,{method:"DELETE"}),
  webhook:(c:ApiConfig,id:string)=>request<{id:string;token:string}>(c,`/v1/connectors/${id}/webhooks`,{method:"POST",body:JSON.stringify({})}),
};

export const embedApi = {
  createSession: (c: ApiConfig, projectId: string, body?: { ttlSeconds?: number; scopes?: string[]; appOrigin?: string }) =>
    request<{projectId:string;projectName:string;expiresAt:string;scopes:string[];token:string;embedUrl:string}>(c, "/v1/embed/sessions", { method:"POST", body: JSON.stringify({ projectId, ...(body || {}) }) }),
};

export const api = {
  // Projects
  listProjects: (c: ApiConfig) => request<Project[]>(c, "/v1/projects"),
  createProject: (c: ApiConfig, body: { name: string; description?: string; startDate: string }) => request<Project>(c, "/v1/projects", { method: "POST", body: JSON.stringify(body) }),
  deleteProject: (c: ApiConfig, id: string) => request<void>(c, `/v1/projects/${id}`, { method: "DELETE" }),
  importSchedule: (c: ApiConfig, projectId: string, body: any) => request<any>(c, `/v1/projects/${projectId}/import`, { method: "POST", body: JSON.stringify(body) }),
  getProject: (c: ApiConfig, id: string) => request<Project>(c, `/v1/projects/${id}`),

  // Tasks
  listTasks: (c: ApiConfig, projectId: string) =>
    request<Task[]>(c, `/v1/projects/${projectId}/tasks`),

  createTask: (
    c: ApiConfig,
    projectId: string,
    body: {
      name: string;
      taskType?: string;
      expectedStart: string;
      expectedEnd: string;
      parentId?: string;
    }
  ) =>
    request<Task>(c, `/v1/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // The single mutation endpoint for every date change — drag or typed date,
  // both call this exact function with the same shape.
  updateTask: (c: ApiConfig, taskId: string, patch: Partial<Task>) =>
    request<Task>(c, `/v1/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteTask: (c: ApiConfig, taskId: string) =>
    request<void>(c, `/v1/tasks/${taskId}`, { method: "DELETE" }),

  setTarget: (c: ApiConfig, taskId: string, targetDate: string | null) =>
    request<TargetResult>(c, `/v1/tasks/${taskId}/target`, {
      method: "POST",
      body: JSON.stringify({ targetDate }),
    }),

  explainTask: (c: ApiConfig, taskId: string) =>
    request<ExplainResult>(c, `/v1/tasks/${taskId}/explain`),

  // Dependencies
  listDependencies: (c: ApiConfig, projectId: string) =>
    request<Dependency[]>(c, `/v1/projects/${projectId}/dependencies`),

  createDependency: (
    c: ApiConfig,
    projectId: string,
    body: { predecessorId: string; successorId: string; dependencyType?: string; lagDays?: number }
  ) =>
    request<{dependency: Dependency; schedule: {taskCount:number;criticalTaskCount:number;changedTaskCount:number;movedTaskCount:number;changedTasks:Array<{taskId:string;taskName:string;startShiftDays:number;finishShiftDays:number;oldSlack:number|null;slackDays:number;oldIsCritical:boolean|null;isCritical:boolean}>;computedAt:string}|null}>(c, `/v1/projects/${projectId}/dependencies`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateDependency: (c: ApiConfig, id: string, body: { dependencyType?: string; lagDays?: number }) =>
    request<Dependency>(c, `/v1/dependencies/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDependency: (c: ApiConfig, id: string) =>
    request<void>(c, `/v1/dependencies/${id}`, { method: "DELETE" }),

  // Resources
  listResources: (c: ApiConfig) => request<Resource[]>(c, "/v1/resources"),
  listProjectResources: (c: ApiConfig, projectId: string) => request<Array<Resource & { externalId?: string | null; source?: string | null; assignmentCount?: number; assignments?: Array<{id:string;taskId:string;taskName:string;allocationPct:number;units:number;role?:string|null;start:string;end:string}> }>>(c, `/v1/projects/${projectId}/resources`),
  resourceIntelligence: (c: ApiConfig, projectId: string) => request<any>(c, `/v1/projects/${projectId}/resource-intelligence`),
  createResource: (c: ApiConfig, body: { name: string; role?: string; type?: string; capacityHoursPerDay?: number; capacityUnits?: number; unitLabel?: string; availabilityPct?: number; projectId?: string }) =>
    request<Resource>(c, "/v1/resources", { method: "POST", body: JSON.stringify(body) }),
  updateResource: (c: ApiConfig, id: string, body: Partial<Resource>) => request<Resource>(c, `/v1/resources/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteResource: (c: ApiConfig, id: string) => request<void>(c, `/v1/resources/${id}`, { method: "DELETE" }),
  assignResource: (c: ApiConfig, taskId: string, body: { resourceId: string; allocationPct?: number; units?: number; role?: string }) =>
    request<{ id: string; taskId: string; resourceId: string; allocationPct: number }>(c, `/v1/tasks/${taskId}/assignments`, { method: "POST", body: JSON.stringify(body) }),
  deleteAssignment: (c: ApiConfig, id: string) => request<void>(c, `/v1/assignments/${id}`, { method: "DELETE" }),
  getResourceWorkload: (c: ApiConfig, id: string) => request<{ resourceId: string; capacityHoursPerDay: number; peakAllocationPct:number; peakAllocatedHoursPerDay:number; overloaded:boolean; peakAt:string|null; assignments: Array<{assignmentId:string;taskId:string;taskName:string;start:string;end:string;allocationPct:number;allocatedHoursPerDay:number}> }>(c, `/v1/resources/${id}/workload`),
  getProjectResourceLeveling: (c: ApiConfig, projectId: string) => request<{projectId:string;resources:Array<{resourceId:string;name:string;capacityHoursPerDay:number;allocationPct:number;overloaded:boolean;assignments:Array<{taskId:string;taskName:string;allocationPct:number;start:string;end:string;role?:string|null}>}>;overloadedCount:number}>(c, `/v1/projects/${projectId}/resources/leveling`),

  monteCarlo: (c: ApiConfig, projectId: string, body: { iterations?: number; uncertainty?: number }) =>
    request<any>(c, `/v1/projects/${projectId}/simulations/monte-carlo`, { method: "POST", body: JSON.stringify(body) }),
  scenarioImpact: (c: ApiConfig, projectId: string, body: { changes: Array<{ taskId: string; expectedStart?: string; expectedEnd?: string; durationDays?: number }> }) =>
    request<{beforeFinish:string;afterFinish:string;deltaDays:number;impactedTasks:Array<{taskId:string;startShiftDays:number;finishShiftDays:number}>;warning:string}>(c, `/v1/projects/${projectId}/scenarios/impact`, { method: "POST", body: JSON.stringify(body) }),
  // Enterprise organization/admin
  listApiKeys: (c: ApiConfig, organizationId: string) => request<any[]>(c, `/v1/organizations/${organizationId}/api-keys`),
  createApiKey: (c: ApiConfig, organizationId: string, body: {label:string;scopes:string[]}) => request<any>(c, `/v1/organizations/${organizationId}/api-keys`, {method:"POST",body:JSON.stringify(body)}),
  revokeApiKey: (c: ApiConfig, organizationId: string, keyId: string) => request<any>(c, `/v1/organizations/${organizationId}/api-keys/${keyId}`, {method:"DELETE"}),
  inviteMember: (c: ApiConfig, organizationId: string, body: {email:string;role:string}) => request<any>(c, `/v1/organizations/${organizationId}/invitations`, {method:"POST",body:JSON.stringify(body)}),
  listMembers: (c: ApiConfig, organizationId: string) => request<any[]>(c, `/v1/organizations/${organizationId}/members`),
  auditLog: (c: ApiConfig, organizationId: string) => request<any[]>(c, `/v1/organizations/${organizationId}/audit-log`),

  health: (c: ApiConfig, projectId: string) => request<any>(c, `/v1/projects/${projectId}/intelligence/health`),
  decisionBrief: (c: ApiConfig, projectId: string) => request<any>(c, `/v1/projects/${projectId}/decision/brief`),
  intelligenceSummary: (c: ApiConfig, projectId: string) => request<any>(c, `/v1/projects/${projectId}/intelligence/summary`),
  aiStatus: (c: ApiConfig, projectId: string) => request<any>(c, `/v1/projects/${projectId}/ai/status`),
  macStatus: (c: ApiConfig) => request<any>(c, `/v1/mac/status`),
  macSettings: (c: ApiConfig, body:any) => request<any>(c, `/v1/mac/settings`, {method:"PATCH",body:JSON.stringify(body)}),
  aiBrief: (c: ApiConfig, projectId: string, question?: string) => request<any>(c, `/v1/projects/${projectId}/ai/brief`, { method:"POST", body:JSON.stringify(question?{question}:{}) }),
  aiCommand: (c: ApiConfig, projectId: string, instruction: string) => request<any>(c, `/v1/projects/${projectId}/ai/command`, {method:"POST",body:JSON.stringify({instruction})}),
  aiSchedule: (c: ApiConfig, projectId:string, mode:"analyze"|"recommend"|"autonomous", instruction?:string) => request<any>(c, `/v1/projects/${projectId}/ai/schedule`, {method:"POST",body:JSON.stringify({mode,instruction:instruction?.trim()||undefined})}),
  aiScheduleApply: (c: ApiConfig, projectId:string, runId:string) => request<any>(c, `/v1/projects/${projectId}/ai/schedule/${runId}/apply`, {method:"POST",body:JSON.stringify({})}),
  aiScheduleRuns: (c: ApiConfig, projectId:string) => request<any[]>(c, `/v1/projects/${projectId}/ai/schedule/runs`),
  aiScheduleRollback: (c: ApiConfig, projectId:string, runId:string) => request<any>(c, `/v1/projects/${projectId}/ai/schedule/${runId}/rollback`, {method:"POST",body:JSON.stringify({})}),
  aiAlerts: (c: ApiConfig, projectId: string) => request<any[]>(c, `/v1/projects/${projectId}/ai/alerts`),
  recoveryRecommendations: (c: ApiConfig, projectId: string, body: { targetDate?: string }) => request<any>(c, `/v1/projects/${projectId}/recovery/recommendations`, { method:"POST", body:JSON.stringify(body) }),
  resourceLeveling: (c: ApiConfig, projectId: string) => request<any>(c, `/v1/projects/${projectId}/resources/leveling`),
  listScenarios: (c: ApiConfig, projectId: string) => request<any[]>(c, `/v1/projects/${projectId}/scenarios`),
  saveScenario: (c: ApiConfig, projectId: string, body: any) => request<any>(c, `/v1/projects/${projectId}/scenarios`, { method:"POST", body:JSON.stringify(body) }),
  compareScenarios: (c: ApiConfig, projectId: string, body: any) => request<any>(c, `/v1/projects/${projectId}/scenarios/compare`, { method:"POST", body:JSON.stringify(body) }),
  forecastRuns: (c: ApiConfig, projectId: string) => request<any[]>(c, `/v1/projects/${projectId}/forecast-runs`),
  history: (c: ApiConfig, projectId: string) => request<any[]>(c, `/v1/projects/${projectId}/history`),
  createSnapshot: (c: ApiConfig, projectId: string, label: string) => request<any>(c, `/v1/projects/${projectId}/history/snapshots`, {method:"POST", body:JSON.stringify({label})}),

  // Force recompute (bulk-sync use; normally unnecessary since every write
  // already triggers one server-side)
  validateSchedule: (c: ApiConfig, projectId: string) => request<{valid:boolean;taskCount:number;dependencyCount:number;cycleTaskIds:string[];cycleTaskNames:string[]}>(c, `/v1/projects/${projectId}/schedule/validate`),

  recompute: (c: ApiConfig, projectId: string) =>
    request<{
      projectId: string;
      taskCount: number;
      criticalTaskCount: number;
      changedTaskCount: number;
      changedTasks: Array<{ taskId:string; taskName:string; startShiftDays:number; finishShiftDays:number; isCritical:boolean; slackDays:number }>;
      computedAt: string;
    }>(c, `/v1/projects/${projectId}/schedule/recompute`, { method: "POST" }),
};

export { ApiError };
