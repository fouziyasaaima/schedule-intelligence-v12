import { FastifyInstance } from "fastify";
import { requireApiKey, requireScope } from "../plugins/auth";
import { generateMac, macAlerts, macStatus, saveMacSettings } from "../mac-service";

export async function aiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireApiKey);
  app.get("/mac/status", { preHandler: requireScope("forecast:read") }, async req => macStatus(req.organizationId!));
  app.patch("/mac/settings", { preHandler: requireScope("projects:write") }, async req => saveMacSettings(req.organizationId!, req.body || {}));
  app.get("/projects/:id/ai/status", { preHandler: requireScope("forecast:read") }, async req => macStatus(req.organizationId!));
  app.post("/projects/:id/ai/brief", { preHandler: requireScope("forecast:read") }, async req => {
    const { id } = req.params as { id:string }; const body=(req.body||{}) as {question?:string};
    return generateMac(id,req.organizationId!,body.question?.trim()||undefined);
  });
  app.get("/projects/:id/ai/alerts", { preHandler: requireScope("forecast:read") }, async req => {
    const { id }=req.params as {id:string}; return macAlerts(id,req.organizationId!);
  });
}
