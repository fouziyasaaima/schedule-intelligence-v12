import { createHash } from "node:crypto";
import { prisma } from "./db";
import { computeSchedule } from "./scheduling/cpm";

export type MacProvider = "gemini" | "openai";

type MacSettingsView = {
  enabled:boolean; provider:MacProvider; model:string; dailyBudgetUsd:number; monthlyBudgetUsd:number;
  maxRequestCostUsd:number; maxTokensPerRequest:number; requireConfirmationAboveUsd:number;
  cacheEnabled:boolean; dataPolicy:string; autonomousWatch:boolean; watchIntervalMinutes:number; notifyEmail:boolean;
};

const MODEL_CATALOG = [
  {provider:"gemini",model:"gemini-2.5-flash-lite",label:"Gemini 2.5 Flash-Lite",inputPerMillion:0.10,outputPerMillion:0.40,role:"Cost-efficient default"},
  {provider:"gemini",model:"gemini-3.1-flash-lite",label:"Gemini 3.1 Flash-Lite",inputPerMillion:0.25,outputPerMillion:1.50,role:"Higher-quality economical"},
  {provider:"gemini",model:"gemini-3.8-flash",label:"Gemini 3.8 Flash",inputPerMillion:0.75,outputPerMillion:3.75,role:"Advanced Flash"},
  {provider:"openai",model:"gpt-5.6",label:"GPT-5.6",inputPerMillion:0,outputPerMillion:0,role:"Configure pricing before enabling"},
];
const cache=new Map<string,{expiresAt:number;result:any}>();
const DAY=86_400_000;
const money=(n:number)=>Math.max(0,Number.isFinite(n)?n:0);

function configuredDefault():MacSettingsView{
  const provider=(String(process.env.MAC_DEFAULT_PROVIDER||process.env.AI_PROVIDER||"gemini").toLowerCase()==="openai"?"openai":"gemini") as MacProvider;
  const model=String(process.env.MAC_DEFAULT_MODEL||process.env[provider==="gemini"?"GEMINI_MODEL":"OPENAI_MODEL"]||"gemini-2.5-flash-lite").trim();
  return {enabled:String(process.env.MAC_ENABLED??"true").toLowerCase()!=="false",provider,model,dailyBudgetUsd:Number(process.env.MAC_DAILY_BUDGET_USD||1),monthlyBudgetUsd:Number(process.env.MAC_MONTHLY_BUDGET_USD||10),maxRequestCostUsd:Number(process.env.MAC_MAX_REQUEST_COST_USD||0.05),maxTokensPerRequest:Math.min(24000,Math.max(1000,Number(process.env.MAC_MAX_TOKENS_PER_REQUEST||12000))),requireConfirmationAboveUsd:Number(process.env.MAC_REQUIRE_CONFIRMATION_ABOVE_USD||0.02),cacheEnabled:String(process.env.MAC_CACHE_ENABLED??"true").toLowerCase()!=="false",dataPolicy:String(process.env.MAC_DATA_POLICY||"MINIMAL"),autonomousWatch:String(process.env.MAC_AUTONOMOUS_WATCH||process.env.AI_WATCH_ENABLED||"false").toLowerCase()==="true",watchIntervalMinutes:Math.max(15,Number(process.env.MAC_WATCH_INTERVAL_MINUTES||process.env.AI_WATCH_INTERVAL_MINUTES||60)),notifyEmail:String(process.env.MAC_NOTIFY_EMAIL||process.env.AI_NOTIFY_EMAIL||"false").toLowerCase()==="true"};
}

async function settingsFor(organizationId:string):Promise<MacSettingsView & {id?:string}> {
  const row=await prisma.macSettings.findUnique({where:{organizationId}});
  const d=configuredDefault();
  if(!row)return d;
  return {...d,id:row.id,enabled:row.enabled,provider:(row.provider==="openai"?"openai":"gemini") as MacProvider,model:row.model,dailyBudgetUsd:row.dailyBudgetUsd,monthlyBudgetUsd:row.monthlyBudgetUsd,maxRequestCostUsd:row.maxRequestCostUsd,maxTokensPerRequest:row.maxTokensPerRequest,requireConfirmationAboveUsd:row.requireConfirmationAboveUsd,cacheEnabled:row.cacheEnabled,dataPolicy:row.dataPolicy,autonomousWatch:row.autonomousWatch,watchIntervalMinutes:Math.max(15,row.watchIntervalMinutes),notifyEmail:row.notifyEmail};
}

function modelInfo(provider:MacProvider,model:string){return MODEL_CATALOG.find(x=>x.provider===provider&&x.model===model);}
function keyFor(provider:string){return String(process.env[provider==="gemini"?"GEMINI_API_KEY":"OPENAI_API_KEY"]||"").trim();}
function estimateTokens(text:string){return Math.max(1,Math.ceil(text.length/4));}
function estimateCost(provider:MacProvider,model:string,inputTokens:number,outputTokens:number){const m=modelInfo(provider,model);if(!m||(!m.inputPerMillion&&!m.outputPerMillion))return null;return inputTokens/1e6*m.inputPerMillion+outputTokens/1e6*m.outputPerMillion;}

async function usageTotals(organizationId:string){
  const now=new Date(); const dayStart=new Date(now);dayStart.setHours(0,0,0,0); const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const [day,month]=await Promise.all([
    prisma.macUsage.aggregate({where:{organizationId,createdAt:{gte:dayStart}},_sum:{actualCostUsd:true}}),
    prisma.macUsage.aggregate({where:{organizationId,createdAt:{gte:monthStart}},_sum:{actualCostUsd:true}}),
  ]);
  return {daily:money(day._sum.actualCostUsd||0),monthly:money(month._sum.actualCostUsd||0)};
}

function parseJson(text:string){const cleaned=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");try{return JSON.parse(cleaned)}catch{}const a=cleaned.indexOf("{");const b=cleaned.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(cleaned.slice(a,b+1));throw Object.assign(new Error("MAC returned invalid structured output."),{code:"MAC_INVALID_OUTPUT",statusCode:502});}

function buildSafeContext(project:any,tasks:any[],deps:any[],resources:any[],forecast:any){
  const cpm=computeSchedule(tasks.map(t=>({id:t.id,expectedStart:new Date(t.expectedStart),expectedEnd:new Date(t.expectedEnd),durationDays:t.durationDays,isManualSchedule:t.isManualSchedule,targetDate:t.targetDate})),deps.map(d=>({predecessorId:d.predecessorId,successorId:d.successorId,dependencyType:d.dependencyType,lagDays:d.lagDays,isActive:d.isActive})));
  const pred=new Map<string,number>(),succ=new Map<string,number>();for(const d of deps){pred.set(d.successorId,(pred.get(d.successorId)||0)+1);succ.set(d.predecessorId,(succ.get(d.predecessorId)||0)+1)}
  const now=Date.now(); const refs=new Map<string,string>();tasks.forEach((t,i)=>refs.set(t.id,`Task-${String(i+1).padStart(3,"0")}`));
  const top=tasks.map(t=>{const r=cpm.get(t.id);const targetRisk=!!t.targetDate&&!!r&&r.expectedEnd.getTime()>new Date(t.targetDate).getTime();const overdue=t.actualEnd==null&&new Date(t.expectedEnd).getTime()<now&&t.progressPct<100;const degree=(pred.get(t.id)||0)+(succ.get(t.id)||0);const score=(r?.isCritical?50:0)+(targetRisk?40:0)+(overdue?35:0)+Math.max(0,20-(r?.slackDays??20))+Math.min(20,degree*3);return {ref:refs.get(t.id),start:t.expectedStart,end:t.expectedEnd,progress:t.progressPct,status:t.status,targetDate:t.targetDate,critical:!!r?.isCritical,slackDays:r?.slackDays??null,targetRisk,overdue,predecessors:pred.get(t.id)||0,successors:succ.get(t.id)||0,actualStarted:!!t.actualStart,actualFinished:!!t.actualEnd,score}}).sort((a,b)=>b.score-a.score);
  const resourceSignals=resources.map((r,i)=>({ref:`Resource-${String(i+1).padStart(3,"0")}`,allocationPct:r.assignments.reduce((s:number,a:any)=>s+a.allocationPct,0),assignedTaskCount:r.assignments.length})).sort((a,b)=>b.allocationPct-a.allocationPct);
  const finish=tasks.reduce((m,t)=>Math.max(m,new Date(t.expectedEnd).getTime()),0);
  return {project:{ref:"PROJECT",startDate:project.startDate,status:project.status},scale:{tasks:tasks.length,dependencies:deps.length,resources:resources.length},deterministic:{criticalTasks:tasks.filter(t=>cpm.get(t.id)?.isCritical).length,targetRiskTasks:top.filter(x=>x.targetRisk).length,overdueTasks:top.filter(x=>x.overdue).length,overloadedResources:resourceSignals.filter(r=>r.allocationPct>100).length,plannedFinish:Number.isFinite(finish)?new Date(finish).toISOString():null},topTasks:top.slice(0,50).map(({score,...x})=>x),topResources:resourceSignals.slice(0,20),forecast:forecast?.result||null};
}

function promptFor(context:any,question?:string){return `You are MAC — Schedule Intelligence's reasoning engine. You receive MINIMAL, pseudonymized scheduling evidence. Do not attempt to identify people, organizations, external systems or real task names. Treat deterministic values as ground truth. Never invent missing facts. Separate evidence from recommendations. Prefer 3-5 high-value findings. Do not propose irreversible actions; suggest previewable next steps.\n\nReturn ONLY JSON: {"executiveSummary":"...","outlook":"...","priorities":["..."],"insights":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW|INFO","title":"...","summary":"...","why":"...","actions":["..."],"evidenceRefs":["Task-001"]}]}\n\n${question?`USER QUESTION:\n${question.slice(0,1500)}\n\n`:""}SAFE SCHEDULE EVIDENCE:\n${JSON.stringify(context)}`}

async function callModel(provider:MacProvider,model:string,prompt:string,maxTokens:number){
  const key=keyFor(provider);if(!key)throw Object.assign(new Error(`${provider==="gemini"?"GEMINI_API_KEY":"OPENAI_API_KEY"} is not configured.`),{code:"MAC_KEY_MISSING",statusCode:503});
  if(provider==="gemini"){
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,input:prompt,generation_config:{thinking_level:"low",max_output_tokens:maxTokens}}),signal:AbortSignal.timeout(45_000)});
    const data:any=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(`Gemini request failed (${response.status}). ${String(data?.error?.message||"No response detail").slice(0,400)}`),{code:"MAC_PROVIDER_ERROR",statusCode:502});
    const text=Array.isArray(data?.steps)?data.steps.filter((s:any)=>s?.type==="model_output").flatMap((s:any)=>Array.isArray(s?.content)?s.content:[]).map((c:any)=>c?.text||"").filter(Boolean).join("\n"):"";if(!text)throw Object.assign(new Error("Gemini returned no text output."),{code:"MAC_EMPTY_OUTPUT",statusCode:502});
    return {text,inputTokens:Number(data?.usage?.input_tokens||data?.usage_metadata?.prompt_token_count||estimateTokens(prompt)),outputTokens:Number(data?.usage?.output_tokens||data?.usage_metadata?.candidates_token_count||estimateTokens(text))};
  }
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,input:prompt,max_output_tokens:maxTokens}),signal:AbortSignal.timeout(45_000)});const data:any=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(`OpenAI request failed (${response.status}). ${String(data?.error?.message||"No response detail").slice(0,400)}`),{code:"MAC_PROVIDER_ERROR",statusCode:502});const text=Array.isArray(data?.output)?data.output.flatMap((o:any)=>Array.isArray(o?.content)?o.content:[]).map((c:any)=>c?.text||"").filter(Boolean).join("\n"):"";if(!text)throw Object.assign(new Error("OpenAI returned no text output."),{code:"MAC_EMPTY_OUTPUT",statusCode:502});return {text,inputTokens:Number(data?.usage?.input_tokens||estimateTokens(prompt)),outputTokens:Number(data?.usage?.output_tokens||estimateTokens(text))};
}

function normalize(raw:any,p:MacProvider,model:string,refMap:Map<string,string>,cost:number){
  const levels=new Set(["CRITICAL","HIGH","MEDIUM","LOW","INFO"]);const insights=Array.isArray(raw?.insights)?raw.insights.slice(0,8).map((x:any)=>({severity:levels.has(String(x?.severity).toUpperCase())?String(x.severity).toUpperCase():"INFO",title:String(x?.title||"Schedule signal").slice(0,140),summary:String(x?.summary||"").slice(0,700),why:String(x?.why||"").slice(0,900),actions:Array.isArray(x?.actions)?x.actions.map((a:any)=>String(a)).slice(0,4):[],evidenceTaskIds:Array.isArray(x?.evidenceRefs)?x.evidenceRefs.map((r:any)=>refMap.get(String(r))).filter(Boolean).slice(0,8):[]})):[];
  return {provider:p,model,generatedAt:new Date().toISOString(),estimatedCostUsd:cost,executiveSummary:String(raw?.executiveSummary||"No executive summary was returned.").slice(0,1800),outlook:String(raw?.outlook||"").slice(0,1200),priorities:Array.isArray(raw?.priorities)?raw.priorities.map((x:any)=>String(x)).slice(0,6):[],insights};
}

export async function macStatus(organizationId:string){
  const s=await settingsFor(organizationId);const totals=await usageTotals(organizationId);return {...s,configured:Boolean(keyFor(s.provider)),catalog:MODEL_CATALOG.map(x=>({...x,configured:Boolean(keyFor(x.provider)),selected:x.provider===s.provider&&x.model===s.model})),usage:totals,budgetRemaining:{daily:Math.max(0,s.dailyBudgetUsd-totals.daily),monthly:Math.max(0,s.monthlyBudgetUsd-totals.monthly)}};
}

export async function saveMacSettings(organizationId:string,input:any){
  const current=await settingsFor(organizationId);const provider=(input.provider==="openai"?"openai":"gemini") as MacProvider;const model=String(input.model||current.model).trim();if(!modelInfo(provider,model))throw Object.assign(new Error("Unsupported MAC model. Choose a model from MAC Studio."),{code:"MAC_MODEL_UNSUPPORTED",statusCode:400});
  const data={enabled:Boolean(input.enabled??current.enabled),provider,model,dailyBudgetUsd:Math.max(0.01,Number(input.dailyBudgetUsd??current.dailyBudgetUsd)),monthlyBudgetUsd:Math.max(0.01,Number(input.monthlyBudgetUsd??current.monthlyBudgetUsd)),maxRequestCostUsd:Math.max(0.001,Number(input.maxRequestCostUsd??current.maxRequestCostUsd)),maxTokensPerRequest:Math.min(24000,Math.max(1000,Number(input.maxTokensPerRequest??current.maxTokensPerRequest))),requireConfirmationAboveUsd:Math.max(0,Number(input.requireConfirmationAboveUsd??current.requireConfirmationAboveUsd)),cacheEnabled:Boolean(input.cacheEnabled??current.cacheEnabled),dataPolicy:"MINIMAL",autonomousWatch:Boolean(input.autonomousWatch??current.autonomousWatch),watchIntervalMinutes:Math.max(15,Number(input.watchIntervalMinutes??current.watchIntervalMinutes)),notifyEmail:Boolean(input.notifyEmail??current.notifyEmail)};
  const row=await prisma.macSettings.upsert({where:{organizationId},create:{organizationId,...data},update:data});return {...row,usage:await usageTotals(organizationId)};
}

export async function generateMac(projectId:string,organizationId:string,question?:string){
  const settings=await settingsFor(organizationId);if(!settings.enabled)throw Object.assign(new Error("MAC is disabled by workspace policy."),{code:"MAC_DISABLED",statusCode:403});if(!keyFor(settings.provider))throw Object.assign(new Error(`MAC provider is not configured. Set ${settings.provider==="gemini"?"GEMINI_API_KEY":"OPENAI_API_KEY"}.`),{code:"MAC_KEY_MISSING",statusCode:503});
  const project=await prisma.project.findFirst({where:{id:projectId,organizationId}});if(!project)throw Object.assign(new Error("Project not found"),{statusCode:404,code:"PROJECT_NOT_FOUND"});
  const [tasks,deps,resources,forecast]=await Promise.all([prisma.task.findMany({where:{projectId},include:{assignments:true},orderBy:{sortOrder:"asc"}}),prisma.dependency.findMany({where:{projectId,isActive:true}}),prisma.resource.findMany({where:{organizationId},include:{assignments:{where:{task:{projectId}}}}}),prisma.forecastRun.findFirst({where:{projectId},orderBy:{createdAt:"desc"}})]);
  const context=buildSafeContext(project,tasks,deps,resources,forecast);
  let safeQuestion=question?.slice(0,1500);
  if(safeQuestion){
    safeQuestion=safeQuestion.replaceAll(project.name,"PROJECT");
    tasks.forEach((t,i)=>{if(t.name) safeQuestion=safeQuestion!.replaceAll(t.name,`Task-${String(i+1).padStart(3,"0")}`);});
    resources.forEach((r,i)=>{if(r.name) safeQuestion=safeQuestion!.replaceAll(r.name,`Resource-${String(i+1).padStart(3,"0")}`);});
  }
  const prompt=promptFor(context,safeQuestion);const key=createHash("sha256").update(JSON.stringify({projectId,question:safeQuestion||"brief",model:settings.model,context})).digest("hex");
  if(settings.cacheEnabled){const hit=cache.get(key);if(hit&&hit.expiresAt>Date.now()){await prisma.macUsage.create({data:{organizationId,projectId,settingsId:settings.id,provider:settings.provider,model:settings.model,requestKind:question?"QUESTION":"BRIEF",estimatedCostUsd:0,actualCostUsd:0,cacheHit:true,contextHash:key}});return {...hit.result,cacheHit:true};}}
  const inputTokens=estimateTokens(prompt),outputTokens=Math.min(settings.maxTokensPerRequest,2200);const estimate=estimateCost(settings.provider,settings.model,inputTokens,outputTokens);if(estimate===null)throw Object.assign(new Error("MAC pricing is not configured for this model. Set a known-cost model before enabling requests."),{code:"MAC_PRICING_UNKNOWN",statusCode:400});if(estimate>settings.maxRequestCostUsd)throw Object.assign(new Error(`MAC blocked this request because its estimated cost exceeds the per-request limit ($${settings.maxRequestCostUsd.toFixed(4)}).`),{code:"MAC_COST_LIMIT",statusCode:429});
  const totals=await usageTotals(organizationId);if(totals.daily+estimate>settings.dailyBudgetUsd||totals.monthly+estimate>settings.monthlyBudgetUsd)throw Object.assign(new Error("MAC blocked this request because the configured AI budget has been reached."),{code:"MAC_BUDGET_EXCEEDED",statusCode:429});
  const out=await callModel(settings.provider,settings.model,prompt,outputTokens);const actual=estimateCost(settings.provider,settings.model,out.inputTokens,out.outputTokens)??estimate;const refMap=new Map<string,string>();tasks.forEach((t,i)=>refMap.set(`Task-${String(i+1).padStart(3,"0")}`,t.id));const result=normalize(parseJson(out.text),settings.provider,settings.model,refMap,actual);
  await prisma.macUsage.create({data:{organizationId,projectId,settingsId:settings.id,provider:settings.provider,model:settings.model,requestKind:question?"QUESTION":"BRIEF",inputTokens:out.inputTokens,outputTokens:out.outputTokens,estimatedCostUsd:estimate,actualCostUsd:actual,cacheHit:false,contextHash:key}});
  if(settings.cacheEnabled)cache.set(key,{expiresAt:Date.now()+15*60_000,result});
  if(!question){await prisma.insight.create({data:{projectId,kind:"SUMMARY",confidence:0.8,payload:{...result,mac:true}}});for(const item of result.insights.slice(0,5))await prisma.insight.create({data:{projectId,kind:"SUGGESTION",confidence:item.severity==="CRITICAL"?0.95:item.severity==="HIGH"?0.85:0.7,payload:{...item,ai:true,mac:true,fingerprint:createHash("sha256").update(JSON.stringify(item)).digest("hex"),generatedAt:result.generatedAt}}});}
  return {...result,cacheHit:false};
}

export async function macAlerts(projectId:string,organizationId:string){const project=await prisma.project.findFirst({where:{id:projectId,organizationId}});if(!project)throw Object.assign(new Error("Project not found"),{statusCode:404,code:"PROJECT_NOT_FOUND"});return prisma.insight.findMany({where:{projectId,kind:"SUGGESTION",payload:{path:["mac"],equals:true}},orderBy:{createdAt:"desc"},take:12});}

export async function runMacWatchCycle(log:(message:string)=>void=console.log){
  const projects=await prisma.project.findMany({where:{status:"ACTIVE"},take:50});
  for(const project of projects){
    try{
      const settings=await settingsFor(project.organizationId);if(!settings.autonomousWatch)continue;
      const latestWatch=await prisma.macUsage.findFirst({where:{organizationId:project.organizationId,projectId:project.id,requestKind:"WATCH"},orderBy:{createdAt:"desc"}});
      if(latestWatch && Date.now()-latestWatch.createdAt.getTime()<settings.watchIntervalMinutes*60_000)continue;
      const latestTask=await prisma.task.aggregate({where:{projectId:project.id},_max:{updatedAt:true}});
      const fingerprint=createHash("sha256").update(`${project.id}|${project.updatedAt.toISOString()}|${latestTask._max.updatedAt?.toISOString()||""}`).digest("hex");
      const previous=await prisma.macUsage.findFirst({where:{organizationId:project.organizationId,projectId:project.id,requestKind:"WATCH",contextHash:fingerprint},orderBy:{createdAt:"desc"}});
      if(previous)continue;
      const beforeCount=await prisma.macUsage.count({where:{organizationId:project.organizationId,projectId:project.id,requestKind:"WATCH"}});
      if(beforeCount>0){const latest=await prisma.macUsage.findFirst({where:{organizationId:project.organizationId,projectId:project.id,requestKind:"WATCH"},orderBy:{createdAt:"desc"}});if(latest?.contextHash===fingerprint)continue;}
      const result=await generateMac(project.id,project.organizationId);
      // Mark the watch fingerprint without making a second model call.
      await prisma.macUsage.create({data:{organizationId:project.organizationId,projectId:project.id,settingsId:settings.id,provider:settings.provider,model:settings.model,requestKind:"WATCH",estimatedCostUsd:0,actualCostUsd:0,cacheHit:true,contextHash:fingerprint}});
      void result;
    }catch(e){log(`MAC watch skipped project ${project.id}: ${e instanceof Error?e.message:"unknown"}`);}
  }
}
