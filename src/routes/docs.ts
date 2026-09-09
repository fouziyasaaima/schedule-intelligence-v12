import { FastifyInstance } from "fastify";

const security = [{ bearerAuth: [] }];
const json = (example: unknown) => ({ content: { "application/json": { schema: { type: "object" }, example } } });

export const scheduleIntelligenceOpenApi = {
  openapi: "3.0.3",
  info: { title: "Schedule Intelligence API", version: "11.4.0", description: "Enterprise API for schedule planning, dependency-driven recomputation, resource intelligence, probabilistic forecasting and decision workflows." },
  servers: [{ url: "/", description: "Current Schedule Intelligence API server" }],
  security,
  tags: [
    { name:"Projects" }, { name:"Tasks" }, { name:"Dependencies" }, { name:"Resources" },
    { name:"Schedule" }, { name:"Forecast" }, { name:"Scenarios" }, { name:"Intelligence" }, { name:"System" }
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
    "/v1/projects/{id}/recovery/recommendations": {post:{tags:["Intelligence"],requestBody:json({targetDate:"2026-10-25T00:00:00.000Z"}),responses:{200:{description:"Ranked recovery recommendations"}}}}
  }
};

export async function docsRoutes(app: FastifyInstance) {
  app.get("/openapi.json", async () => scheduleIntelligenceOpenApi);
  app.get("/docs", async (_req, reply) => reply.type("text/html; charset=utf-8").send(`<!doctype html><html><head><title>Schedule Intelligence API</title><meta charset="utf-8"><style>body{font:15px system-ui;margin:40px;max-width:1100px}pre{background:#111827;color:#e5e7eb;padding:18px;border-radius:10px;overflow:auto}a{color:#0ea5e9}</style></head><body><h1>Schedule Intelligence API</h1><p>OpenAPI contract: <a href="/openapi.json">/openapi.json</a></p><p>Authentication: <code>Authorization: Bearer &lt;API_KEY&gt;</code></p><pre>curl -H "Authorization: Bearer YOUR_KEY" /v1/projects</pre><h2>Production security</h2><ul><li>API keys are stored hashed in PostgreSQL.</li><li>Every resource lookup is tenant-scoped by organization.</li><li>Use HTTPS and restrict CORS origins.</li><li>Keep long-lived production keys on servers, not public browser bundles.</li><li>Preview endpoints do not mutate live tasks.</li></ul></body></html>`));
}
