import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { requireApiKey, requireScope } from "../plugins/auth";
import { scenarioSchema, scenarioImpactSchema } from "../schemas";

const DAY = 86400000;
type Change = { taskId: string; expectedStart?: string; expectedEnd?: string; durationDays?: number };
function finish(tasks:any[], deps:any[]) {
  const by = new Map(tasks.map(t=>[t.id,t])); const indeg=new Map(tasks.map(t=>[t.id,0])); const next=new Map<string,string[]>();
  for(const d of deps){ if(!by.has(d.predecessorId)||!by.has(d.successorId)) continue; indeg.set(d.successorId,(indeg.get(d.successorId)||0)+1); next.set(d.predecessorId,[...(next.get(d.predecessorId)||[]),d.successorId]); }
  const q=tasks.filter(t=>(indeg.get(t.id)||0)===0).map(t=>t.id), order:string[]=[]; while(q.length){const id=q.shift()!;order.push(id);for(const n of next.get(id)||[]){indeg.set(n,(indeg.get(n)||0)-1);if(indeg.get(n)===0)q.push(n)}}
  for(const t of tasks) if(!order.includes(t.id)) order.push(t.id);
  const out=new Map<string,{start:number;finish:number}>(); let projectFinish=0;
  for(const id of order){const t=by.get(id); if(!t) continue; let start=t.expectedStart.getTime(); const dur=Math.max(1,t.durationDays)*DAY; for(const d of deps.filter(x=>x.successorId===id)){const p=out.get(d.predecessorId);if(!p)continue;const lag=d.lagDays*DAY;if(d.dependencyType==="START_TO_START")start=Math.max(start,p.start+lag);else if(d.dependencyType==="FINISH_TO_FINISH")start=Math.max(start,p.finish+lag-dur);else if(d.dependencyType==="START_TO_FINISH")start=Math.max(start,p.start+lag-dur);else start=Math.max(start,p.finish+lag)} const f=start+dur;out.set(id,{start,finish:f});projectFinish=Math.max(projectFinish,f)}
  return {projectFinish, tasks:out};
}
export async function scenarioRoutes(app: FastifyInstance){
 app.addHook("preHandler",requireApiKey);
 app.post("/projects/:id/scenarios/impact",{preHandler:requireScope("forecast:read")},async(req,reply)=>{
  const {id}=req.params as {id:string}; const body=scenarioImpactSchema.parse(req.body);
  const project=await prisma.project.findFirst({where:{id,organizationId:req.organizationId!}}); if(!project)return reply.code(404).send({error:"Project not found"});
  const tasks=await prisma.task.findMany({where:{projectId:id}}); const deps=await prisma.dependency.findMany({where:{projectId:id,isActive:true}}); const changes=body.changes||[];
  const before=finish(tasks,deps); const changed=new Set<string>();
  const scenario=tasks.map(t=>{const c=changes.find(x=>x.taskId===t.id);if(!c)return t;changed.add(t.id);const s=c.expectedStart?new Date(c.expectedStart):t.expectedStart;const e=c.expectedEnd?new Date(c.expectedEnd):t.expectedEnd;return {...t,expectedStart:s,expectedEnd:e,durationDays:c.durationDays??Math.max(1,Math.round((e.getTime()-s.getTime())/DAY))}});
  const after=finish(scenario,deps); const deltaDays=Math.round((after.projectFinish-before.projectFinish)/DAY);
  const impacted=[...after.tasks.entries()].map(([taskId,v])=>{const b=before.tasks.get(taskId);return {taskId,startShiftDays:b?Math.round((v.start-b.start)/DAY):0,finishShiftDays:b?Math.round((v.finish-b.finish)/DAY):0}}).filter(x=>x.startShiftDays||x.finishShiftDays);
  return {projectId:id,mode:"preview",changedTaskIds:[...changed],beforeFinish:new Date(before.projectFinish).toISOString(),afterFinish:new Date(after.projectFinish).toISOString(),deltaDays,impactedTasks:impacted,warning:deltaDays>0?"Scenario delays the project finish.":deltaDays<0?"Scenario pulls the project finish earlier.":"Scenario does not change the calculated project finish."};
 });
}
