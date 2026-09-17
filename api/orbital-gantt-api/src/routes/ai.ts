import { FastifyInstance } from "fastify";
import { requireApiKey, requireScope } from "../plugins/auth";
import { generateMac, macAlerts, macStatus, saveMacSettings, runMacSchedulePlanner, macScheduleRuns } from "../mac-service";
import { prisma } from "../db";
import { recomputeProjectSchedule } from "../scheduling/recompute";

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
  app.get("/projects/:id/ai/schedule/runs", { preHandler: requireScope("forecast:read") }, async req => {
    const { id }=req.params as {id:string}; return macScheduleRuns(id,req.organizationId!);
  });
  app.post("/projects/:id/ai/schedule", { preHandler: requireScope("projects:write") }, async (req, reply) => {
    const { id }=req.params as {id:string}; const body=(req.body||{}) as {mode?:"analyze"|"recommend"|"autonomous"};
    const mode=body.mode||"recommend";
    if(!["analyze","recommend","autonomous"].includes(mode)) return reply.code(400).send({error:"Invalid MAC schedule mode",code:"MAC_SCHEDULE_MODE_INVALID"});
    return runMacSchedulePlanner(id,req.organizationId!,mode);
  });
  app.post("/projects/:id/ai/schedule/:runId/rollback", { preHandler: requireScope("projects:write") }, async (req, reply) => {
    const { id, runId }=req.params as {id:string;runId:string};
    const run=await prisma.aiScheduleRun.findFirst({where:{id:runId,projectId:id,organizationId:req.organizationId!,status:"APPLIED"}});
    if(!run) return reply.code(404).send({error:"Applied MAC schedule run not found",code:"MAC_SCHEDULE_RUN_NOT_FOUND"});
    const latest=await prisma.aiScheduleRun.findFirst({where:{projectId:id,organizationId:req.organizationId!,status:"APPLIED"},orderBy:{createdAt:"desc"}});
    if(latest?.id!==run.id) return reply.code(409).send({error:"Rollback is limited to the latest applied MAC schedule run to protect newer work.",code:"MAC_ROLLBACK_LATEST_ONLY"});
    const changes:any=run.changes||{}; const baseline=changes.baseline||{};
    for(const d of Array.isArray(changes.appliedDependencyIds)?changes.appliedDependencyIds:[]) await prisma.dependency.delete({where:{id:d}}).catch(()=>undefined);
    const baselineTasks=Array.isArray(baseline.tasks)?baseline.tasks:[];
    const touchedTaskIds=new Set<string>([...baselineTasks.map((t:any)=>t.id),...(Array.isArray(changes.resourceAssignments)?changes.resourceAssignments.map((a:any)=>a.taskId):[])]);
    if(touchedTaskIds.size){await prisma.assignment.deleteMany({where:{taskId:{in:[...touchedTaskIds]},task:{project:{organizationId:req.organizationId!}}}});}
    for(const a of Array.isArray(baseline.assignments)?baseline.assignments:[]) await prisma.assignment.create({data:{taskId:a.taskId,resourceId:a.resourceId,allocationPct:a.allocationPct,role:a.role||null}}).catch(()=>undefined);
    for(const t of baselineTasks) await prisma.task.update({where:{id:t.id},data:{expectedStart:new Date(t.expectedStart),expectedEnd:new Date(t.expectedEnd),isManualSchedule:Boolean(t.isManualSchedule)}}).catch(()=>undefined);
    await recomputeProjectSchedule(prisma,id);
    await prisma.aiScheduleRun.update({where:{id:run.id},data:{status:"ROLLED_BACK"}});
    return {ok:true,runId:run.id,status:"ROLLED_BACK",projectId:id};
  });
}
