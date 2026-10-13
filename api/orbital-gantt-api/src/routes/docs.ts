import { FastifyInstance } from "fastify";

const security = [{ bearerAuth: [] }];
const json = (example: unknown) => ({ content: { "application/json": { schema: { type: "object" }, example } } });

export const scheduleIntelligenceOpenApi = {
  openapi: "3.0.3",
  info: { title: "Schedule Intelligence API", version: "20.3.2", description: "Enterprise, API-first scheduling platform for dependency-driven planning, resource intelligence, safe schedule proposals, connectors, synchronization and optional MAC intelligence. The /api/v1 contract is the preferred integration surface; /v1 remains for backward compatibility." },
  servers: [{ url: "/", description: "Current Schedule Intelligence API server" }],
  security,
  tags: [
    { name:"Projects" }, { name:"Tasks" }, { name:"Dependencies" }, { name:"Resources" },
    { name:"Schedule" }, { name:"Forecast" }, { name:"Connectors" }, { name:"Scenarios" }, { name:"Intelligence" }, { name:"System" }
  ],
  components: {
    securitySchemes: { bearerAuth: { type:"http", scheme:"bearer", bearerFormat:"API key", description:"Send Authorization: Bearer <api-key>. Keep production keys server-side." } },
    schemas: {
      Project:{type:"object",properties:{id:{type:"string"},name:{type:"string"},description:{type:"string",nullable:true},startDate:{type:"string",format:"date-time"},status:{type:"string"}}},
      Task:{type:"object",properties:{id:{type:"string"},projectId:{type:"string"},name:{type:"string"},taskType:{type:"string"},expectedStart:{type:"string",format:"date-time"},expectedEnd:{type:"string",format:"date-time"},durationDays:{type:"integer"},progressPct:{type:"integer"}}},
      Resource:{type:"object",properties:{id:{type:"string"},name:{type:"string"},role:{type:"string",nullable:true},capacityHoursPerDay:{type:"number"}}},
      Dependency:{type:"object",properties:{id:{type:"string"},predecessorId:{type:"string"},successorId:{type:"string"},dependencyType:{type:"string"},lagDays:{type:"integer"}}}
    }
  },
  paths: {
    "/health": {get:{tags:["System"],security:[],responses:{200:{description:"Healthy"}}}},
    "/ready": {get:{tags:["System"],security:[],responses:{200:{description:"Ready"},503:{description:"Database unavailable"}}}},
    "/v1/embed/sessions": {post:{tags:["System"],requestBody:json({projectId:"HOST_PROJECT_ID",projectSource:"prms",ttlSeconds:900,scopes:["projects:read","tasks:read","tasks:write","dependencies:read","dependencies:write","resources:read","resources:write","schedule:read","schedule:write","forecast:read"]}),responses:{200:{description:"Short-lived project-scoped embedded session"}}}},
    "/v1/projects": {get:{tags:["Projects"],responses:{200:{description:"Projects"}}},post:{tags:["Projects"],requestBody:json({name:"Website relaunch",startDate:"2026-09-04T00:00:00.000Z"}),responses:{201:{description:"Created"}}}},
    "/v1/projects/{id}": {get:{tags:["Projects"],responses:{200:{description:"Project"}}},patch:{tags:["Projects"],responses:{200:{description:"Updated"}}},delete:{tags:["Projects"],responses:{204:{description:"Deleted"}}}},
    "/v1/projects/{projectId}/tasks": {get:{tags:["Tasks"],responses:{200:{description:"Tasks"}}},post:{tags:["Tasks"],requestBody:json({name:"Design",taskType:"TASK",expectedStart:"2026-09-04T00:00:00.000Z",expectedEnd:"2026-09-10T00:00:00.000Z"}),responses:{201:{description:"Created"}}}},
    "/v1/tasks/{id}": {get:{tags:["Tasks"],responses:{200:{description:"Task"}}},patch:{tags:["Tasks"],responses:{200:{description:"Updated"}}},delete:{tags:["Tasks"],responses:{204:{description:"Deleted"}}}},
    "/v1/projects/{projectId}/dependencies": {get:{tags:["Dependencies"],responses:{200:{description:"Dependencies"}}},post:{tags:["Dependencies"],requestBody:json({predecessorId:"task_a",successorId:"task_b",dependencyType:"FINISH_TO_START",lagDays:0}),responses:{201:{description:"Created"}}}},
    "/v1/dependencies/{id}": {patch:{tags:["Dependencies"],requestBody:json({dependencyType:"START_TO_START",lagDays:1}),responses:{200:{description:"Updated"}}},delete:{tags:["Dependencies"],responses:{204:{description:"Deleted"}}}},
    "/v1/resources": {get:{tags:["Resources"],responses:{200:{description:"Resources"}}},post:{tags:["Resources"],requestBody:json({name:"Alex",role:"Engineer",capacityHoursPerDay:8}),responses:{201:{description:"Created"}}}},
    "/v1/resources/{id}": {delete:{tags:["Resources"],responses:{204:{description:"Deleted"}}}},
    "/v1/tasks/{taskId}/assignments": {post:{tags:["Resources"],requestBody:json({resourceId:"resource_123",allocationPct:100}),responses:{201:{description:"Assignment"}}}},
    "/v1/assignments/{id}": {delete:{tags:["Resources"],responses:{204:{description:"Deleted"}}}},
    "/v1/resources/{id}/workload": {get:{tags:["Resources"],responses:{200:{description:"Workload"}}}},
    "/v1/projects/{id}/resources/leveling": {get:{tags:["Resources"],responses:{200:{description:"Resource overload and leveling insight"}}}},
    "/v1/projects/{id}/schedule/validate": {get:{tags:["Schedule"],responses:{200:{description:"Validate dependency graph and report cycle members"}}}},
    "/v1/projects/{id}/schedule/recompute": {post:{tags:["Schedule"],responses:{200:{description:"Computed schedule"}}}},
    "/v1/tasks/{id}/explain": {get:{tags:["Schedule"],responses:{200:{description:"Schedule explanation"}}}},
    "/v1/projects/{id}/history": {get:{tags:["Schedule"],responses:{200:{description:"Schedule history snapshots"}}}},
    "/v1/projects/{id}/history/snapshots": {post:{tags:["Schedule"],requestBody:json({label:"Baseline review"}),responses:{201:{description:"Snapshot created"}}}},
    "/v1/projects/{id}/history/{snapshotId}": {get:{tags:["Schedule"],responses:{200:{description:"Snapshot details"}}}},
    "/v1/projects/{id}/simulations/monte-carlo": {post:{tags:["Forecast"],requestBody:json({iterations:5000,uncertainty:0.3}),responses:{200:{description:"Probabilistic forecast"}}}},
    "/v1/projects/{id}/forecast-runs": {get:{tags:["Forecast"],responses:{200:{description:"Forecast history"}}}},
    "/v1/projects/{id}/scenarios/impact": {post:{tags:["Scenarios"],requestBody:json({changes:[{taskId:"task_123",expectedStart:"2026-09-08T00:00:00.000Z"}]}),responses:{200:{description:"Non-mutating what-if impact"}}}},
    "/v1/projects/{id}/scenarios": {get:{tags:["Scenarios"],responses:{200:{description:"Saved scenarios"}}},post:{tags:["Scenarios"],requestBody:json({name:"Protect launch",changes:[{taskId:"task_123",durationDays:8}]}),responses:{201:{description:"Saved scenario"}}}},
    "/v1/projects/{id}/scenarios/compare": {post:{tags:["Scenarios"],requestBody:json({leftScenarioId:null,rightScenarioId:"scenario_123"}),responses:{200:{description:"Scenario comparison"}}}},
    "/v1/projects/{id}/decision/brief": {get:{tags:["Intelligence"],responses:{200:{description:"Read-only decision brief"}}}},
    "/v1/projects/{id}/intelligence/health": {get:{tags:["Intelligence"],responses:{200:{description:"Auditable schedule health and risk drivers"}}}},
    "/v1/projects/{id}/recovery/recommendations": {post:{tags:["Intelligence"],requestBody:json({targetDate:"2026-10-25T00:00:00.000Z"}),responses:{200:{description:"Ranked recovery recommendations"}}}},
    "/v1/connectors": {get:{tags:["Connectors"],responses:{200:{description:"Organization connectors"}}},post:{tags:["Connectors"],requestBody:json({name:"PRMS Production",provider:"proprietary",baseUrl:"https://example.com/api",authType:"BEARER",direction:"BIDIRECTIONAL"}),responses:{201:{description:"Connector created"}}}},
    "/v1/connectors/{id}/test": {post:{tags:["Connectors"],responses:{200:{description:"Connection validation"}}}},
    "/v1/connectors/{id}/test-write": {post:{tags:["Connectors"],requestBody:json({operationKey:"taskUpdate",body:{__testExternalId:"1042",startDate:"2026-09-10T00:00:00.000Z"}}),responses:{200:{description:"Write operation validation"}}}},
    "/v1/connectors/{id}/openapi/import": {post:{tags:["Connectors"],requestBody:json({specUrl:"https://api.example.com/openapi.json"}),responses:{200:{description:"Imported OpenAPI operation contract"}}}},
    "/v1/connectors/{id}/discover": {post:{tags:["Connectors"],requestBody:json({operationKey:"get_tasks",body:{}}),responses:{200:{description:"Live external response discovery and field inference"}}}},
    "/v1/connectors/{id}/sync": {post:{tags:["Connectors"],responses:{200:{description:"Synchronization run"}}}},
    "/v1/connectors/{id}/health": {get:{tags:["Connectors"],responses:{200:{description:"Connector health, queued events and open conflicts"}}}},
    "/v1/connectors/{id}/events": {get:{tags:["Connectors"],responses:{200:{description:"Inbound integration event queue"}}}},
    "/v1/connectors/{id}/conflicts": {get:{tags:["Connectors"],responses:{200:{description:"Open synchronization conflicts"}}}},
    "/v1/connectors/{id}/conflicts/{conflictId}/resolve": {post:{tags:["Connectors"],requestBody:json({resolution:"SI_WINS"}),responses:{200:{description:"Conflict resolved"}}}},

    "/v1/connectors/{id}/mappings": {post:{tags:["Connectors"],requestBody:json({entityType:"task",externalField:"Task_Name",internalField:"name",direction:"IMPORT"}),responses:{201:{description:"Mapping created"}}}},
    "/v1/connectors/{id}/webhooks": {post:{tags:["Connectors"],responses:{200:{description:"Webhook endpoint created"}}}},
    "/v1/connectors/{id}/google/spreadsheets": {get:{tags:["Connectors"],responses:{200:{description:"Discover Google Sheets visible to the connected account"}}}},
    "/v1/connectors/{id}/google/spreadsheets/{spreadsheetId}": {get:{tags:["Connectors"],responses:{200:{description:"Read Google spreadsheet metadata and worksheets"}}}},
    "/v1/connectors/{id}/google/spreadsheets/{spreadsheetId}/values": {get:{tags:["Connectors"],responses:{200:{description:"Preview Google worksheet values"}}}},
    "/v1/connectors/{id}/microsoft/workbooks": {get:{tags:["Connectors"],responses:{200:{description:"Discover Excel workbooks visible to the connected Microsoft account"}}}},
    "/v1/connectors/{id}/microsoft/workbooks/{itemId}": {get:{tags:["Connectors"],responses:{200:{description:"Read Excel workbook worksheets"}}}},
    "/v1/connectors/{id}/microsoft/workbooks/{itemId}/values": {get:{tags:["Connectors"],responses:{200:{description:"Preview Excel worksheet range values"}}}},
    "/api/v1/projects/{id}/schedule/analyze": {post:{tags:["Schedule"],responses:{200:{description:"Deterministic, read-only schedule analysis"}}}},
    "/api/v1/projects/{id}/schedule/proposals": {get:{tags:["Schedule"],responses:{200:{description:"List schedule proposals"}}},post:{tags:["Schedule"],requestBody:json({name:"Protect launch",reason:"User requested intelligent schedule proposal",changes:[{taskId:"task_123",expectedStart:"2026-10-10T14:30:00.000Z",durationDays:2}]}),responses:{201:{description:"Schedule proposal created"}}}},
    "/api/v1/schedule/proposals/{proposalId}/approve": {post:{tags:["Schedule"],responses:{200:{description:"Approve a schedule proposal"}}}},
    "/api/v1/schedule/proposals/{proposalId}/publish": {post:{tags:["Schedule"],responses:{200:{description:"Publish an approved proposal transactionally"}}}},
    "/api/v1/connectors": {get:{tags:["Connectors"],responses:{200:{description:"Organization connectors"}}},post:{tags:["Connectors"],requestBody:json({name:"MES Production",provider:"generic-openapi",baseUrl:"https://mes.example.com/api",authType:"BEARER",direction:"BIDIRECTIONAL"}),responses:{201:{description:"Connector created"}}}},
    "/v1/connectors/oauth/callback": {get:{tags:["Connectors"],security:[],responses:{200:{description:"OAuth callback"}}}}
  }
};

// The enterprise namespace is preferred for new integrations. Keep /v1 in the
// contract so existing clients remain documented during the migration window.
for (const [path, operation] of Object.entries(scheduleIntelligenceOpenApi.paths)) {
  if (path.startsWith("/v1/")) {
    const enterprisePath = `/api${path}`;
    if (!(enterprisePath in scheduleIntelligenceOpenApi.paths)) {
      (scheduleIntelligenceOpenApi.paths as Record<string, unknown>)[enterprisePath] = operation;
    }
  }
}

export async function docsRoutes(app: FastifyInstance) {
  app.get("/openapi.json", async () => scheduleIntelligenceOpenApi);
  app.get("/docs", async (_req, reply) => reply.type("text/html; charset=utf-8").send(`<!doctype html><html><head><title>Schedule Intelligence API</title><meta charset="utf-8"><style>body{font:15px system-ui;margin:40px;max-width:1100px}pre{background:#111827;color:#e5e7eb;padding:18px;border-radius:10px;overflow:auto}a{color:#0ea5e9}</style></head><body><h1>Schedule Intelligence API</h1><p>OpenAPI contract: <a href="/openapi.json">/openapi.json</a></p><p>Authentication: <code>Authorization: Bearer &lt;API_KEY&gt;</code></p><pre>curl -H "Authorization: Bearer YOUR_KEY" /v1/projects</pre><h2>Production security</h2><ul><li>API keys are stored hashed in PostgreSQL.</li><li>Every resource lookup is tenant-scoped by organization.</li><li>Use HTTPS and restrict CORS origins.</li><li>Keep long-lived production keys on servers, not public browser bundles.</li><li>Preview endpoints do not mutate live tasks.</li></ul></body></html>`));
}
