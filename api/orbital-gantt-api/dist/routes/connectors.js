"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectorRoutes = connectorRoutes;
const zod_1 = require("zod");
const db_1 = require("../db");
const auth_1 = require("../plugins/auth");
const service_1 = require("../connectors/service");
const operation = zod_1.z.object({ method: zod_1.z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]), path: zod_1.z.string().min(1), enabled: zod_1.z.boolean().default(true), query: zod_1.z.record(zod_1.z.string()).optional(), headers: zod_1.z.record(zod_1.z.string()).optional(), bodyTemplate: zod_1.z.any().optional() });
const connectorSchema = zod_1.z.object({ name: zod_1.z.string().min(1).max(120), provider: zod_1.z.string().default("generic-rest"), baseUrl: zod_1.z.string().url(), authType: zod_1.z.enum(["NONE", "API_KEY", "BEARER", "BASIC", "OAUTH2_AUTHORIZATION_CODE", "OAUTH2_CLIENT_CREDENTIALS", "CUSTOM_HEADERS"]).default("NONE"), direction: zod_1.z.enum(["IMPORT", "EXPORT", "BIDIRECTIONAL"]).default("IMPORT"), config: zod_1.z.object({ operations: zod_1.z.record(operation).optional(), targetProjectId: zod_1.z.string().nullable().optional(), pagination: zod_1.z.any().optional(), response: zod_1.z.any().optional(), sync: zod_1.z.any().optional(), oauth: zod_1.z.any().optional(), headers: zod_1.z.record(zod_1.z.string()).optional(), auth: zod_1.z.any().optional(), prms: zod_1.z.object({ projectId: zod_1.z.string().min(1).optional(), endpoint: zod_1.z.string().optional(), method: zod_1.z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional() }).optional(), google: zod_1.z.any().optional(), microsoft: zod_1.z.any().optional() }).default({}), secrets: zod_1.z.record(zod_1.z.any()).optional() });
const mappingSchema = zod_1.z.object({ entityType: zod_1.z.enum(["project", "task", "resource"]), externalField: zod_1.z.string().min(1), internalField: zod_1.z.string().min(1), direction: zod_1.z.enum(["IMPORT", "EXPORT", "BOTH"]).default("IMPORT"), transform: zod_1.z.record(zod_1.z.any()).default({}), required: zod_1.z.boolean().default(false) });
function escapeHtml(value) { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] || c)); }
async function connectorRoutes(app) {
    app.get("/connectors/providers/prms/status", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async () => (0, service_1.prmsConfigurationStatus)());
    app.post("/connectors/webhooks/:token", async (req, reply) => { try {
        return reply.code(202).send(await (0, service_1.receiveWebhook)(req.params.token, req.body));
    }
    catch (e) {
        return reply.code(e.statusCode || 500).send({ error: e.message, code: e.code || "WEBHOOK_ERROR" });
    } });
    app.addHook("preHandler", auth_1.requireApiKey);
    app.get("/connectors", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async (req) => db_1.prisma.connector.findMany({ where: { organizationId: req.organizationId }, include: { mappings: true }, orderBy: { createdAt: "desc" } }));
    app.post("/connectors", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req, reply) => { const body = connectorSchema.parse(req.body); const c = await (0, service_1.createConnector)(body, req.organizationId); return reply.code(201).send({ ...c, secretCiphertext: undefined }); });
    app.get("/connectors/:id", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async (req, reply) => { const c = await db_1.prisma.connector.findFirst({ where: { id: req.params.id, organizationId: req.organizationId }, include: { mappings: true, webhooks: true, syncRuns: { orderBy: { startedAt: "desc" }, take: 10 } } }); if (!c)
        return reply.code(404).send({ error: "Connector not found" }); return { ...c, secretCiphertext: undefined }; });
    app.patch("/connectors/:id", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req) => { const body = connectorSchema.partial().parse(req.body); const c = await (0, service_1.updateConnector)(req.params.id, req.organizationId, body); return { ...c, secretCiphertext: undefined }; });
    app.delete("/connectors/:id", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req, reply) => { const c = await db_1.prisma.connector.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } }); if (!c)
        return reply.code(404).send({ error: "Connector not found" }); await db_1.prisma.connector.delete({ where: { id: c.id } }); return reply.code(204).send(); });
    app.get("/connectors/:id/credential", { preHandler: (0, auth_1.requireScope)("connectors:read") }, req => (0, service_1.connectorSecretPreview)(req.params.id, req.organizationId));
    app.post("/connectors/:id/test", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req) => (0, service_1.testConnector)(req.params.id, req.organizationId));
    app.get("/connectors/:id/prms/schedule", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async (req) => (0, service_1.getPrmsSchedule)(req.params.id, req.organizationId));
    app.post("/connectors/:id/prms/open-gantt", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req) => { const result = await (0, service_1.syncConnector)(req.params.id, req.organizationId); return { projectId: result.details?.internalProjectId, externalProjectId: result.details?.projectId, taskCount: result.details?.prmsTaskCount || result.recordsRead }; });
    app.put("/connectors/:id/prms/expected-dates", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req) => (0, service_1.updatePrmsExpectedDates)(req.params.id, req.organizationId, req.body));
    app.post("/connectors/:id/test-write", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req) => { const b = req.body; return (0, service_1.testWriteOperation)(req.params.id, req.organizationId, String(b.operationKey || ""), b.body || {}); });
    app.post("/connectors/:id/openapi/import", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req) => { const b = req.body; return (0, service_1.importOpenApiContract)(req.params.id, req.organizationId, { specUrl: typeof b?.specUrl === "string" ? b.specUrl : undefined, spec: b?.spec }); });
    app.post("/connectors/:id/discover", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req) => { const b = req.body; return (0, service_1.discoverConnectorOperation)(req.params.id, req.organizationId, String(b?.operationKey || ""), { body: b?.body, pathOverride: typeof b?.pathOverride === "string" ? b.pathOverride : undefined }); });
    app.get("/connectors/:id/oauth/authorize", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req) => (0, service_1.authorizeOAuth)(req.params.id, req.organizationId));
    app.get("/connectors/:id/microsoft/workbooks", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async (req) => (0, service_1.microsoftListWorkbooks)(req.params.id, req.organizationId, String(req.query?.q || "")));
    app.get("/connectors/:id/microsoft/workbooks/:itemId", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async (req) => (0, service_1.microsoftGetWorkbook)(req.params.id, req.organizationId, String(req.params.itemId || "")));
    app.get("/connectors/:id/microsoft/workbooks/:itemId/values", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async (req) => (0, service_1.microsoftPreviewValues)(req.params.id, req.organizationId, String(req.params.itemId || ""), String(req.query?.sheetId || ""), String(req.query?.address || "A1:Z30")));
    app.get("/connectors/:id/google/spreadsheets", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async (req) => (0, service_1.googleListSpreadsheets)(req.params.id, req.organizationId, String(req.query?.q || "")));
    app.get("/connectors/:id/google/spreadsheets/:spreadsheetId", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async (req) => (0, service_1.googleGetSpreadsheet)(req.params.id, req.organizationId, String(req.params.spreadsheetId || "")));
    app.get("/connectors/:id/google/spreadsheets/:spreadsheetId/values", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async (req) => (0, service_1.googlePreviewValues)(req.params.id, req.organizationId, String(req.params.spreadsheetId || ""), String(req.query?.range || "")));
    app.get("/connectors/oauth/callback", async (req, reply) => { try {
        const q = req.query;
        if (q.error) {
            const message = String(q.error_description || q.error || "The OAuth provider rejected the request.");
            return reply.type("text/html").send(`<!doctype html><html><body style="font-family:system-ui;padding:32px"><strong>Authorization was not completed.</strong><p>${escapeHtml(message)}</p><script>if(window.opener){window.opener.postMessage({type:'SI_OAUTH_ERROR',message:${JSON.stringify(message)}},window.location.origin);}setTimeout(()=>window.close(),1200);</script></body></html>`);
        }
        await (0, service_1.oauthCallback)(String(q.code || ""), String(q.state || ""));
        return reply.type("text/html").send(`<!doctype html><html><body style="font-family:system-ui;padding:32px"><strong>Connection authorized.</strong><p>You can close this window.</p><script>if(window.opener){window.opener.postMessage({type:'SI_OAUTH_COMPLETE'},window.location.origin);}setTimeout(()=>window.close(),700);</script></body></html>`);
    }
    catch (e) {
        const message = String(e?.message || "OAuth authorization failed.");
        return reply.type("text/html").send(`<!doctype html><html><body style="font-family:system-ui;padding:32px"><strong>Authorization failed.</strong><p>${escapeHtml(message)}</p><script>if(window.opener){window.opener.postMessage({type:'SI_OAUTH_ERROR',message:${JSON.stringify(message)}},window.location.origin);}setTimeout(()=>window.close(),1600);</script></body></html>`);
    } });
    app.post("/connectors/:id/sync", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req) => (0, service_1.syncConnector)(req.params.id, req.organizationId));
    app.get("/connectors/:id/sync-runs", { preHandler: (0, auth_1.requireScope)("connectors:read") }, async (req) => db_1.prisma.connectorSyncRun.findMany({ where: { connectorId: req.params.id, connector: { organizationId: req.organizationId } }, orderBy: { startedAt: "desc" }, take: 30 }));
    app.post("/connectors/:id/mappings", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req, reply) => { const body = mappingSchema.parse(req.body); const c = await db_1.prisma.connector.findFirst({ where: { id: req.params.id, organizationId: req.organizationId } }); if (!c)
        return reply.code(404).send({ error: "Connector not found" }); return reply.code(201).send(await db_1.prisma.connectorMapping.create({ data: { ...body, connectorId: c.id } })); });
    app.patch("/connectors/:id/mappings/:mappingId", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req, reply) => { const body = mappingSchema.partial().parse(req.body); const m = await db_1.prisma.connectorMapping.findFirst({ where: { id: req.params.mappingId, connectorId: req.params.id, connector: { organizationId: req.organizationId } } }); if (!m)
        return reply.code(404).send({ error: "Mapping not found" }); return db_1.prisma.connectorMapping.update({ where: { id: m.id }, data: body }); });
    app.delete("/connectors/:id/mappings/:mappingId", { preHandler: (0, auth_1.requireScope)("connectors:write") }, async (req, reply) => { const m = await db_1.prisma.connectorMapping.findFirst({ where: { id: req.params.mappingId, connectorId: req.params.id, connector: { organizationId: req.organizationId } } }); if (!m)
        return reply.code(404).send({ error: "Mapping not found" }); await db_1.prisma.connectorMapping.delete({ where: { id: m.id } }); return reply.code(204).send(); });
    app.post("/connectors/:id/webhooks", { preHandler: (0, auth_1.requireScope)("connectors:write") }, req => (0, service_1.createWebhook)(req.params.id, req.organizationId));
}
//# sourceMappingURL=connectors.js.map