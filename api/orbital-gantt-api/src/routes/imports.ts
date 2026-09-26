import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { requireApiKey, requireScope } from "../plugins/auth";
import { z } from "zod";

const taskSchema = z.object({
  externalId: z.string().optional(), wbs: z.string().optional(), name: z.string().min(1).max(500), description: z.string().optional(),
  category: z.string().optional(), procedure: z.string().optional(), notes: z.string().optional(), status: z.string().optional(),
  start: z.coerce.date(), end: z.coerce.date().optional(), durationHours: z.number().nonnegative().optional(), parentExternalId: z.string().optional(),
  ownerName: z.string().optional(), resourceNames: z.array(z.string()).default([]), customFields: z.record(z.any()).default({}),
  taskType: z.enum(["SUMMARY","TASK","MILESTONE"]).optional(), progressPct: z.number().int().min(0).max(100).optional(),
}).superRefine((value, ctx) => {
  if (!value.end && value.durationHours === undefined) ctx.addIssue({code:z.ZodIssueCode.custom,path:["end"],message:"Provide Finish or Duration (hrs)."});
});
const resourceSchema = z.object({
  externalId: z.string().optional(), name: z.string().min(1).max(180), type: z.enum(["PERSON","EQUIPMENT","FACILITY","VEHICLE","MATERIAL","TEAM","OTHER"]).default("OTHER"),
  role: z.string().optional(), capacityHoursPerDay: z.number().positive().max(24).optional(), capacityUnits: z.number().positive().max(100000).optional(), unitLabel: z.string().max(40).optional(),
  availabilityPct: z.number().min(0).max(100).optional(), active: z.boolean().optional(), owner: z.string().optional(), status: z.string().optional(), notes: z.string().optional(), customFields: z.record(z.any()).default({}),
});
const dependencySchema = z.object({
  predecessorExternalId: z.string().min(1),
  successorExternalId: z.string().min(1),
  dependencyType: z.preprocess((value) => {
    const v = String(value ?? "").trim().toUpperCase().replace(/[ -]/g, "_");
    const map: Record<string, string> = {
      FS: "FINISH_TO_START",
      SS: "START_TO_START",
      FF: "FINISH_TO_FINISH",
      SF: "START_TO_FINISH",
      FINISH_START: "FINISH_TO_START",
      START_START: "START_TO_START",
      FINISH_FINISH: "FINISH_TO_FINISH",
      START_FINISH: "START_TO_FINISH",
    };
    return map[v] || v || "FINISH_TO_START";
  }, z.enum(["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"])).default("FINISH_TO_START"),
  lagDays: z.number().int().default(0)
});
const assignmentSchema = z.object({ taskExternalId: z.string().min(1), resourceExternalId: z.string().min(1), assignmentType: z.string().optional(), allocationPct: z.number().int().min(1).max(100).default(100), units: z.number().positive().default(1), role: z.string().optional() });
const importSchema = z.object({ projectId: z.string().min(1), sourceName: z.string().max(300).optional(), mode: z.enum(["APPEND","UPSERT"]).default("UPSERT"), tasks: z.array(taskSchema).max(10000), resources: z.array(resourceSchema).max(5000).default([]), dependencies: z.array(dependencySchema).max(20000).default([]), assignments: z.array(assignmentSchema).max(20000).default([]) });
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const splitResourceText = (value?: string) => String(value || "").split(/[;\n,]+/).map(normalize).filter(Boolean);

async function ensureSISFConnector(tx: any, organizationId: string) {
  const existing = await tx.connector.findFirst({ where: { organizationId, provider: "sisf" } });
  if (existing) return existing;
  return tx.connector.create({ data: { organizationId, name: "Schedule Intelligence Standard Format", provider: "sisf", baseUrl: "sisf://local", authType: "NONE", status: "CONNECTED", direction: "BIDIRECTIONAL", config: { schema: "SISF", version: "1.0" } } });
}

// Connector identities are only required for externally identified records.
// Native SI resources in the simple one-sheet template must not create
// connector identities: the database also enforces uniqueness by internalId.
async function upsertConnectorIdentitySafe(tx: any, connectorId: string, entityType: string, externalId: string, internalId: string) {
  const byExternal = await tx.connectorIdentity.findUnique({
    where: { connectorId_entityType_externalId: { connectorId, entityType, externalId } }
  });
  const byInternal = await tx.connectorIdentity.findUnique({
    where: { connectorId_entityType_internalId: { connectorId, entityType, internalId } }
  });

  if (byExternal) {
    if (byExternal.internalId === internalId) return byExternal;
    // The external key is authoritative. If the target internal record already
    // owns another external identity, remove that stale identity first.
    if (byInternal && byInternal.id !== byExternal.id) {
      await tx.connectorIdentity.delete({ where: { id: byInternal.id } });
    }
    return tx.connectorIdentity.update({ where: { id: byExternal.id }, data: { internalId } });
  }

  if (byInternal) {
    // Same SI record was previously mapped under another external key.
    return tx.connectorIdentity.update({ where: { id: byInternal.id }, data: { externalId } });
  }

  return tx.connectorIdentity.create({ data: { connectorId, entityType, externalId, internalId } });
}

export async function importRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireApiKey);
  app.post("/projects/:projectId/import", { preHandler: requireScope("tasks:write") }, async (req, reply) => {
    const projectId = String((req.params as any).projectId || "");
    const body = importSchema.parse({ ...(req.body as any), projectId });
    const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: req.organizationId! }, select: { id: true, name: true } });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const result = await prisma.$transaction(async tx => {
      const sisf = await ensureSISFConnector(tx, req.organizationId!);
      const resourceByKey = new Map<string, any>();
      const resourceByExternal = new Map<string, any>();
      const existingResources = await tx.resource.findMany({ where: { organizationId: req.organizationId! } });
      for (const r of existingResources) resourceByKey.set(normalize(r.name), r);
      const resourceIdentities = await tx.connectorIdentity.findMany({ where: { connectorId: sisf.id, entityType: "resource" } });
      for (const i of resourceIdentities) resourceByExternal.set(i.externalId, i.internalId);

      const resourcesCreated: any[] = [], resourcesUpdated: any[] = [];
      for (const item of body.resources) {
        const key = normalize(item.name);
        let existing = item.externalId ? await tx.connectorIdentity.findUnique({ where: { connectorId_entityType_externalId: { connectorId: sisf.id, entityType: "resource", externalId: item.externalId } } }).then((i:any)=>i ? existingResources.find(r=>r.id===i.internalId) : null) : null;
        if (!existing) existing = resourceByKey.get(key);
        const data:any = { role:item.role, type:item.type, capacityHoursPerDay:item.capacityHoursPerDay ?? 8, capacityUnits:item.capacityUnits ?? 1, unitLabel:item.unitLabel ?? "unit", availabilityPct:item.availabilityPct ?? 100, isActive:item.active ?? true, customFields:item.customFields ?? {} };
        const resource = existing && body.mode === "UPSERT" ? await tx.resource.update({ where:{id:existing.id}, data }) : existing ? existing : await tx.resource.create({ data:{ organizationId:req.organizationId!, name:item.name, ...data } });
        if (existing && body.mode === "UPSERT") resourcesUpdated.push(resource); else if (!existing) resourcesCreated.push(resource);
        await tx.projectResource.upsert({ where:{projectId_resourceId:{projectId,resourceId:resource.id}}, create:{projectId,resourceId:resource.id}, update:{active:true} });
        // Only real external IDs participate in connector identity mapping.
        // Synthetic/local resource names from the simple template stay native SI records.
        if (item.externalId) await upsertConnectorIdentitySafe(tx, sisf.id, "resource", item.externalId, resource.id);
        resourceByKey.set(key,resource); if(item.externalId) resourceByExternal.set(item.externalId,resource.id);
      }

      for (const task of body.tasks) {
        const owner=normalize(task.ownerName||""); if(!owner || resourceByKey.has(owner)) continue;
        const created=await tx.resource.create({ data:{organizationId:req.organizationId!,name:task.ownerName!.trim(),type:"PERSON",capacityHoursPerDay:8,capacityUnits:1,unitLabel:"person",availabilityPct:100,customFields:{}} });
        await tx.projectResource.create({data:{projectId,resourceId:created.id}}); resourceByKey.set(owner,created); resourcesCreated.push(created);
      }

      const taskByExternal = new Map<string, any>(); const taskByWbs = new Map<string, any>();
      const sisfTaskIds = await tx.connectorIdentity.findMany({ where:{connectorId:sisf.id,entityType:"task"} });
      for(const i of sisfTaskIds){ const t=await tx.task.findUnique({where:{id:i.internalId}}); if(t?.projectId===projectId) taskByExternal.set(i.externalId,t); }
      const existingTasks=await tx.task.findMany({where:{projectId},orderBy:{sortOrder:"asc"}}); for(const t of existingTasks) taskByExternal.set(`name:${normalize(t.name)}`,t);
      const createdTasks:any[]=[], updatedTasks:any[]=[], pendingParents:any[]=[];

      for(let i=0;i<body.tasks.length;i++){
        const item=body.tasks[i]; const start=new Date(item.start); const durationMinutes = item.durationHours !== undefined ? Math.max(1, Math.round(item.durationHours * 60)) : Math.max(1, Math.round(((item.end as Date).getTime()-start.getTime())/60000)); const end=item.durationHours !== undefined ? new Date(start.getTime()+durationMinutes*60000) : new Date(item.end!); if(end<start) throw Object.assign(new Error(`Task '${item.name}' has an end date before its start date.`),{statusCode:400});
        let existing:any=null; if(item.externalId) existing=taskByExternal.get(item.externalId);
        if(!existing && body.mode==="UPSERT") existing=taskByExternal.get(`name:${normalize(item.name)}`);
        const status=["ACTIVE","ON_HOLD","CLOSED","DELAYED"].includes(String(item.status||"").toUpperCase())?String(item.status).toUpperCase():"ACTIVE";
        const data:any={name:item.name,description:[item.category,item.procedure,item.notes,item.description].filter(Boolean).join("\n"),expectedStart:start,expectedEnd:end,durationDays:Math.max(1,Math.ceil((end.getTime()-start.getTime())/86400000)),durationMinutes,status,progressPct:item.progressPct??0,isManualSchedule:true,sortOrder:i,taskType:item.taskType||"TASK",customFields:item.customFields||{}};
        const t=existing&&body.mode==="UPSERT"?await tx.task.update({where:{id:existing.id},data}):existing?existing:await tx.task.create({data:{...data,projectId}});
        if(existing&&body.mode==="UPSERT") updatedTasks.push(t); else if(!existing) createdTasks.push(t);
        if(item.externalId){
          // Simple Excel IDs (for example 1, 2, 3...) are local row identifiers,
          // not globally unique connector IDs. Keep them in the project map but
          // do not register them in the organization-wide SISF identity table.
          const isLocalRowId = /^\\d+$/.test(item.externalId.trim());
          if(!isLocalRowId) await upsertConnectorIdentitySafe(tx, sisf.id, "task", item.externalId, t.id);
          taskByExternal.set(item.externalId,t);
        }
        if(item.wbs) taskByWbs.set(normalize(item.wbs),t); taskByExternal.set(`name:${normalize(item.name)}`,t);
        if(item.parentExternalId) pendingParents.push({taskId:t.id,parentKey:normalize(item.parentExternalId)});
        const names=new Set<string>([...item.resourceNames,...(item.ownerName?[item.ownerName]:[])].flatMap(splitResourceText));
        for(const name of names){const r=resourceByKey.get(name);if(r)await tx.assignment.upsert({where:{taskId_resourceId:{taskId:t.id,resourceId:r.id}},create:{taskId:t.id,resourceId:r.id,allocationPct:100,units:1},update:{}});}
      }
      for(const p of pendingParents){const parent=taskByExternal.get(p.parentKey)||taskByWbs.get(p.parentKey)||taskByExternal.get(`name:${p.parentKey}`);if(parent&&parent.id!==p.taskId)await tx.task.update({where:{id:p.taskId},data:{parentId:parent.id}});}

      for(const d of body.dependencies){const pre=taskByExternal.get(d.predecessorExternalId)||taskByWbs.get(normalize(d.predecessorExternalId));const suc=taskByExternal.get(d.successorExternalId)||taskByWbs.get(normalize(d.successorExternalId));if(!pre||!suc||pre.id===suc.id)continue;await tx.dependency.upsert({where:{projectId_predecessorId_successorId:{projectId,predecessorId:pre.id,successorId:suc.id}},create:{projectId,predecessorId:pre.id,successorId:suc.id,dependencyType:d.dependencyType,lagDays:d.lagDays},update:{dependencyType:d.dependencyType,lagDays:d.lagDays,isActive:true}});}
      for(const a of body.assignments){const t=taskByExternal.get(a.taskExternalId)||taskByWbs.get(normalize(a.taskExternalId));const rid=resourceByExternal.get(a.resourceExternalId);if(!t||!rid)continue;await tx.assignment.upsert({where:{taskId_resourceId:{taskId:t.id,resourceId:rid}},create:{taskId:t.id,resourceId:rid,allocationPct:a.allocationPct,units:a.units,role:a.role},update:{allocationPct:a.allocationPct,units:a.units,role:a.role}});}

      const finalTasks=await tx.task.findMany({where:{projectId},select:{id:true,parentId:true,taskType:true}});const parentIds=new Set(finalTasks.filter(t=>t.parentId).map(t=>t.parentId!));for(const t of finalTasks)if(parentIds.has(t.id)&&t.taskType!=="SUMMARY")await tx.task.update({where:{id:t.id},data:{taskType:"SUMMARY"}});
      return {projectId,projectName:project.name,tasksCreated:createdTasks.length,tasksUpdated:updatedTasks.length,resourcesCreated:resourcesCreated.length,resourcesUpdated:resourcesUpdated.length,taskCount:body.tasks.length,resourceCount:body.resources.length,dependencyCount:body.dependencies.length,assignmentCount:body.assignments.length,schema:"SISF",schemaVersion:"1.0"};
    });
    return reply.code(200).send({success:true,...result,message:`Imported ${result.tasksCreated+result.tasksUpdated} tasks, ${result.resourcesCreated+result.resourcesUpdated} resources, ${result.dependencyCount} dependencies and ${result.assignmentCount} assignments.`});
  });
}
