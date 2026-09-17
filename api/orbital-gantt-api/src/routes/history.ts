import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { requireApiKey, requireScope } from "../plugins/auth";

export async function historyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireApiKey);
  app.get("/projects/:id/history", { preHandler: requireScope("projects:read") }, async (req, reply) => {
    const { id } = req.params as { id:string };
    const project = await prisma.project.findFirst({ where:{id,organizationId:req.organizationId!} });
    if (!project) return reply.code(404).send({error:"Project not found"});
    return prisma.scheduleSnapshot.findMany({ where:{projectId:id}, orderBy:{createdAt:"desc"}, take:50, select:{id:true,label:true,createdAt:true} });
  });
  app.post("/projects/:id/history/snapshots", { preHandler: requireScope("projects:write") }, async (req, reply) => {
    const { id } = req.params as { id:string }; const body=(req.body||{}) as {label?:string};
    const project=await prisma.project.findFirst({where:{id,organizationId:req.organizationId!}}); if(!project)return reply.code(404).send({error:"Project not found"});
    const tasks=await prisma.task.findMany({where:{projectId:id},orderBy:{sortOrder:"asc"}});
    const snapshot=await prisma.scheduleSnapshot.create({data:{projectId:id,label:body.label?.trim()||`Snapshot ${new Date().toISOString()}`,taskStateJson:tasks.map(t=>({id:t.id,name:t.name,expectedStart:t.expectedStart,expectedEnd:t.expectedEnd,durationDays:t.durationDays,progressPct:t.progressPct,status:t.status,isManualSchedule:t.isManualSchedule}))}});
    return reply.code(201).send({id:snapshot.id,label:snapshot.label,createdAt:snapshot.createdAt});
  });
  app.get("/projects/:id/history/:snapshotId", { preHandler: requireScope("projects:read") }, async (req, reply) => {
    const {id,snapshotId}=req.params as {id:string;snapshotId:string};
    const snapshot=await prisma.scheduleSnapshot.findFirst({where:{id:snapshotId,projectId:id,project:{organizationId:req.organizationId!}}});
    if(!snapshot)return reply.code(404).send({error:"Snapshot not found"}); return snapshot;
  });
}
