import { createHash } from "node:crypto";
import { prisma } from "./db";
import { computeSchedule } from "./scheduling/cpm";
import { recomputeProjectSchedule } from "./scheduling/recompute";

export type MacProvider = "gemini" | "openai";

type MacSettingsView = {
  enabled:boolean; provider:MacProvider; model:string; dailyBudgetUsd:number; monthlyBudgetUsd:number;
  maxRequestCostUsd:number; maxTokensPerRequest:number; requireConfirmationAboveUsd:number;
  cacheEnabled:boolean; dataPolicy:string; autonomousWatch:boolean; watchIntervalMinutes:number; notifyEmail:boolean; autonomousScheduling:boolean; autoApplyDependencies:boolean; autoOptimizeDates:boolean; allowResourceReassignment:boolean;
};

const MODEL_CATALOG = [
  {provider:"gemini",model:"gemini-3.5-flash-lite",label:"Gemini 3.5 Flash-Lite",inputPerMillion:0.30,outputPerMillion:2.50,role:"Current cost-efficient default"},
  {provider:"gemini",model:"gemini-3.1-flash-lite",label:"Gemini 3.1 Flash-Lite",inputPerMillion:0.25,outputPerMillion:1.50,role:"Higher-quality economical"},
  {provider:"gemini",model:"gemini-3.8-flash",label:"Gemini 3.8 Flash",inputPerMillion:0.75,outputPerMillion:3.75,role:"Advanced Flash"},
  {provider:"openai",model:"gpt-5.6",label:"GPT-5.6",inputPerMillion:0,outputPerMillion:0,role:"Configure pricing before enabling"},
];
const cache=new Map<string,{expiresAt:number;result:any}>();
const DAY=86_400_000;
const money=(n:number)=>Math.max(0,Number.isFinite(n)?n:0);

function configuredDefault():MacSettingsView{
  const provider=(String(process.env.MAC_DEFAULT_PROVIDER||process.env.AI_PROVIDER||"gemini").toLowerCase()==="openai"?"openai":"gemini") as MacProvider;
  const model=String(process.env.MAC_DEFAULT_MODEL||process.env[provider==="gemini"?"GEMINI_MODEL":"OPENAI_MODEL"]||"gemini-3.5-flash-lite").trim();
  return {enabled:String(process.env.MAC_ENABLED??"true").toLowerCase()!=="false",provider,model,dailyBudgetUsd:Number(process.env.MAC_DAILY_BUDGET_USD||1),monthlyBudgetUsd:Number(process.env.MAC_MONTHLY_BUDGET_USD||10),maxRequestCostUsd:Number(process.env.MAC_MAX_REQUEST_COST_USD||0.05),maxTokensPerRequest:Math.min(24000,Math.max(1000,Number(process.env.MAC_MAX_TOKENS_PER_REQUEST||12000))),requireConfirmationAboveUsd:Number(process.env.MAC_REQUIRE_CONFIRMATION_ABOVE_USD||0.02),cacheEnabled:String(process.env.MAC_CACHE_ENABLED??"true").toLowerCase()!=="false",dataPolicy:String(process.env.MAC_DATA_POLICY||"MINIMAL"),autonomousWatch:String(process.env.MAC_AUTONOMOUS_WATCH||process.env.AI_WATCH_ENABLED||"false").toLowerCase()==="true",watchIntervalMinutes:Math.max(15,Number(process.env.MAC_WATCH_INTERVAL_MINUTES||process.env.AI_WATCH_INTERVAL_MINUTES||60)),notifyEmail:String(process.env.MAC_NOTIFY_EMAIL||process.env.AI_NOTIFY_EMAIL||"false").toLowerCase()==="true",autonomousScheduling:String(process.env.MAC_AUTONOMOUS_SCHEDULING||"false").toLowerCase()==="true",autoApplyDependencies:String(process.env.MAC_AUTO_APPLY_DEPENDENCIES||"false").toLowerCase()==="true",autoOptimizeDates:String(process.env.MAC_AUTO_OPTIMIZE_DATES||"false").toLowerCase()==="true",allowResourceReassignment:String(process.env.MAC_ALLOW_RESOURCE_REASSIGNMENT||"false").toLowerCase()==="true"};
}

async function settingsFor(organizationId:string):Promise<MacSettingsView & {id?:string}> {
  const row=await prisma.macSettings.findUnique({where:{organizationId}});
  const d=configuredDefault();
  if(!row)return d;
  const provider=(row.provider==="openai"?"openai":"gemini") as MacProvider;
  // Gemini 2.5 Flash-Lite has been retired for new API users. Existing persisted
  // MAC settings can therefore outlive the .env defaults. Migrate that legacy
  // value automatically so changing/redeploying the container is sufficient.
  const persistedModel=String(row.model||"").trim();
  const model=provider==="gemini" && persistedModel==="gemini-2.5-flash-lite" ? (d.provider==="gemini" ? d.model : "gemini-3.5-flash-lite") : persistedModel;
  if(model!==persistedModel){
    await prisma.macSettings.update({where:{id:row.id},data:{model}});
  }
  return {...d,id:row.id,enabled:row.enabled,provider,model,dailyBudgetUsd:row.dailyBudgetUsd,monthlyBudgetUsd:row.monthlyBudgetUsd,maxRequestCostUsd:row.maxRequestCostUsd,maxTokensPerRequest:row.maxTokensPerRequest,requireConfirmationAboveUsd:row.requireConfirmationAboveUsd,cacheEnabled:row.cacheEnabled,dataPolicy:row.dataPolicy,autonomousWatch:row.autonomousWatch,watchIntervalMinutes:Math.max(15,row.watchIntervalMinutes),notifyEmail:row.notifyEmail,autonomousScheduling:row.autonomousScheduling,autoApplyDependencies:row.autoApplyDependencies,autoOptimizeDates:row.autoOptimizeDates,allowResourceReassignment:row.allowResourceReassignment};
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
  const taskById=new Map(tasks.map(t=>[t.id,t]));
  const top=tasks.map(t=>{const r=cpm.get(t.id);const targetRisk=!!t.targetDate&&!!r&&r.expectedEnd.getTime()>new Date(t.targetDate).getTime();const overdue=t.actualEnd==null&&new Date(t.expectedEnd).getTime()<now&&t.progressPct<100;const degree=(pred.get(t.id)||0)+(succ.get(t.id)||0);const score=(r?.isCritical?50:0)+(targetRisk?40:0)+(overdue?35:0)+Math.max(0,20-(r?.slackDays??20))+Math.min(20,degree*3);return {ref:refs.get(t.id),name:redactScheduleText(String(t.name||""),180),description:redactScheduleText(String(t.description||""),260)||null,parentRef:t.parentId?refs.get(t.parentId)||null:null,start:t.expectedStart,end:t.expectedEnd,durationDays:t.durationDays,progress:t.progressPct,status:t.status,targetDate:t.targetDate,critical:!!r?.isCritical,slackDays:r?.slackDays??null,targetRisk,overdue,predecessors:pred.get(t.id)||0,successors:succ.get(t.id)||0,actualStarted:!!t.actualStart,actualFinished:!!t.actualEnd,score}}).sort((a,b)=>b.score-a.score);
  const resourceSignals=resources.map((r,i)=>({ref:`Resource-${String(i+1).padStart(3,"0")}`,name:redactScheduleText(String(r.name||""),160),type:r.type||"OTHER",role:redactScheduleText(String(r.role||""),120)||null,capacityHoursPerDay:r.capacityHoursPerDay??null,capacityUnits:r.capacityUnits??null,unitLabel:r.unitLabel||null,availabilityPct:r.availabilityPct??100,allocationPct:r.assignments.reduce((s:number,a:any)=>s+a.allocationPct,0),assignedTaskCount:r.assignments.length,assignedTasks:r.assignments.slice(0,12).map((a:any)=>redactScheduleText(String(taskById.get(a.taskId)?.name||""),120)).filter(Boolean)})).sort((a,b)=>b.allocationPct-a.allocationPct);
  const dependencySignals=deps.slice(0,80).map(d=>({predecessorRef:refs.get(d.predecessorId),successorRef:refs.get(d.successorId),predecessorName:redactScheduleText(String(taskById.get(d.predecessorId)?.name||""),150),successorName:redactScheduleText(String(taskById.get(d.successorId)?.name||""),150),type:d.dependencyType,lagDays:d.lagDays}));
  const finish=tasks.reduce((m,t)=>Math.max(m,new Date(t.expectedEnd).getTime()),0);
  return {project:{ref:"PROJECT",name:redactScheduleText(String(project.name||"PROJECT"),180),startDate:project.startDate,status:project.status},scale:{tasks:tasks.length,dependencies:deps.length,resources:resources.length},deterministic:{criticalTasks:tasks.filter(t=>cpm.get(t.id)?.isCritical).length,targetRiskTasks:top.filter(x=>x.targetRisk).length,overdueTasks:top.filter(x=>x.overdue).length,overloadedResources:resourceSignals.filter(r=>r.allocationPct>100).length,plannedFinish:Number.isFinite(finish)?new Date(finish).toISOString():null},topTasks:top.slice(0,50).map(({score,...x})=>x),topResources:resourceSignals.slice(0,20),dependencies:dependencySignals,forecast:forecast?.result||null};
}

function promptFor(context:any,question?:string){return `You are MAC — Schedule Intelligence's reasoning engine. You receive MINIMAL, pseudonymized scheduling evidence. Treat deterministic values as ground truth. Never invent missing facts. Answer the user's question directly before adding supporting findings. Use only supplied evidence. If the evidence is insufficient, explicitly say so instead of guessing. Use task names and resource names in the human-readable answer. Never expose Resource-* references, internal resource IDs, connector IDs, or other internal identifiers to the user. Resource names supplied in the evidence are authoritative display names. Separate evidence, inference and recommendation. Do not propose irreversible actions.\n\nReturn ONLY JSON: {"answer":"direct answer to the user's question, or a precise statement that the evidence is insufficient","executiveSummary":"...","outlook":"...","priorities":["..."],"insights":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW|INFO","title":"...","summary":"...","why":"...","actions":["..."],"evidenceRefs":["Task-001"]}],"confidence":0.0}\n\n${question?`USER QUESTION:\n${question.slice(0,1500)}\n\n`:"No user question. Provide a concise schedule brief."}SAFE SCHEDULE EVIDENCE:\n${JSON.stringify(context)}`}

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
  const levels=new Set(["CRITICAL","HIGH","MEDIUM","LOW","INFO"]);const insights=Array.isArray(raw?.insights)?raw.insights.slice(0,8).map((x:any)=>({severity:levels.has(String(x?.severity).toUpperCase())?String(x.severity).toUpperCase():"INFO",title:String(x?.title||"Schedule signal").slice(0,140),summary:String(x?.summary||"").slice(0,700),why:String(x?.why||"").slice(0,900),actions:Array.isArray(x?.actions)?x.actions.map((a:any)=>String(a)).slice(0,4):[],evidenceTaskIds:Array.isArray(x?.evidenceRefs)?x.evidenceRefs.map((r:any)=>refMap.get(String(r))).filter(Boolean).slice(0,8):[]})):[ ];
  const answer=String(raw?.answer||"").trim().slice(0,2400);
  return {provider:p,model,generatedAt:new Date().toISOString(),estimatedCostUsd:cost,answer,executiveSummary:String(raw?.executiveSummary||answer||"No executive summary was returned.").slice(0,1800),outlook:String(raw?.outlook||"").slice(0,1200),priorities:Array.isArray(raw?.priorities)?raw.priorities.map((x:any)=>String(x)).slice(0,6):[],insights};
}

export async function macStatus(organizationId:string){
  const s=await settingsFor(organizationId);const totals=await usageTotals(organizationId);return {...s,configured:Boolean(keyFor(s.provider)),catalog:MODEL_CATALOG.map(x=>({...x,configured:Boolean(keyFor(x.provider)),selected:x.provider===s.provider&&x.model===s.model})),usage:totals,budgetRemaining:{daily:Math.max(0,s.dailyBudgetUsd-totals.daily),monthly:Math.max(0,s.monthlyBudgetUsd-totals.monthly)}};
}

export async function saveMacSettings(organizationId:string,input:any){
  const current=await settingsFor(organizationId);const provider=(input.provider==="openai"?"openai":"gemini") as MacProvider;const model=String(input.model||current.model).trim();if(!modelInfo(provider,model))throw Object.assign(new Error("Unsupported MAC model. Choose a model from MAC Studio."),{code:"MAC_MODEL_UNSUPPORTED",statusCode:400});
  const data={enabled:Boolean(input.enabled??current.enabled),provider,model,dailyBudgetUsd:Math.max(0.01,Number(input.dailyBudgetUsd??current.dailyBudgetUsd)),monthlyBudgetUsd:Math.max(0.01,Number(input.monthlyBudgetUsd??current.monthlyBudgetUsd)),maxRequestCostUsd:Math.max(0.001,Number(input.maxRequestCostUsd??current.maxRequestCostUsd)),maxTokensPerRequest:Math.min(24000,Math.max(1000,Number(input.maxTokensPerRequest??current.maxTokensPerRequest))),requireConfirmationAboveUsd:Math.max(0,Number(input.requireConfirmationAboveUsd??current.requireConfirmationAboveUsd)),cacheEnabled:Boolean(input.cacheEnabled??current.cacheEnabled),dataPolicy:"MINIMAL",autonomousWatch:Boolean(input.autonomousWatch??current.autonomousWatch),watchIntervalMinutes:Math.max(15,Number(input.watchIntervalMinutes??current.watchIntervalMinutes)),notifyEmail:Boolean(input.notifyEmail??current.notifyEmail),autonomousScheduling:Boolean(input.autonomousScheduling??current.autonomousScheduling),autoApplyDependencies:Boolean(input.autoApplyDependencies??current.autoApplyDependencies),autoOptimizeDates:Boolean(input.autoOptimizeDates??current.autoOptimizeDates),allowResourceReassignment:Boolean(input.allowResourceReassignment??current.allowResourceReassignment)};
  const row=await prisma.macSettings.upsert({where:{organizationId},create:{organizationId,...data},update:data});return {...row,usage:await usageTotals(organizationId)};
}

export async function generateMac(projectId:string,organizationId:string,question?:string){
  const settings=await settingsFor(organizationId);if(!settings.enabled)throw Object.assign(new Error("MAC is disabled by workspace policy."),{code:"MAC_DISABLED",statusCode:403});if(!keyFor(settings.provider))throw Object.assign(new Error(`MAC provider is not configured. Set ${settings.provider==="gemini"?"GEMINI_API_KEY":"OPENAI_API_KEY"}.`),{code:"MAC_KEY_MISSING",statusCode:503});
  const project=await prisma.project.findFirst({where:{id:projectId,organizationId}});if(!project)throw Object.assign(new Error("Project not found"),{statusCode:404,code:"PROJECT_NOT_FOUND"});
  const [tasks,deps,resources,forecast]=await Promise.all([prisma.task.findMany({where:{projectId},include:{assignments:true},orderBy:{sortOrder:"asc"}}),prisma.dependency.findMany({where:{projectId,isActive:true}}),prisma.resource.findMany({where:{organizationId,assignments:{some:{task:{projectId}}}},include:{assignments:{where:{task:{projectId}}}}}),prisma.forecastRun.findFirst({where:{projectId},orderBy:{createdAt:"desc"}})]);
  const context:any=buildSafeContext(project,tasks,deps,resources,forecast);
  let safeQuestion=question?.slice(0,1500);
  const focusTaskIndexes:number[]=[]; const focusResourceIndexes:number[]=[];
  if(safeQuestion){
    safeQuestion=safeQuestion.replaceAll(project.name,"PROJECT");
    tasks.forEach((t,i)=>{if(t.name && safeQuestion!.toLowerCase().includes(String(t.name).toLowerCase())){focusTaskIndexes.push(i);safeQuestion=safeQuestion!.replaceAll(t.name,`Task-${String(i+1).padStart(3,"0")}`);}});
    resources.forEach((r,i)=>{if(r.name && safeQuestion!.toLowerCase().includes(String(r.name).toLowerCase())){focusResourceIndexes.push(i);safeQuestion=safeQuestion!.replaceAll(r.name,`Resource-${String(i+1).padStart(3,"0")}`);}});
    // Add only directly referenced records to the minimized context. This keeps large-project
    // questions useful without sending the complete task/resource roster to the model.
    if(focusTaskIndexes.length){
      const refs=new Set(focusTaskIndexes.slice(0,12).map(i=>`Task-${String(i+1).padStart(3,"0")}`));
      context.questionFocusTasks=context.topTasks.filter((t:any)=>refs.has(t.ref));
      for(const i of focusTaskIndexes.slice(0,12)){
        if(!context.questionFocusTasks.some((t:any)=>t.ref===`Task-${String(i+1).padStart(3,"0")}`)){
          const t=tasks[i]; const ref=`Task-${String(i+1).padStart(3,"0")}`; const cpm=computeSchedule(tasks.map(x=>({id:x.id,expectedStart:new Date(x.expectedStart),expectedEnd:new Date(x.expectedEnd),durationDays:x.durationDays,isManualSchedule:x.isManualSchedule,targetDate:x.targetDate})),deps.map(d=>({predecessorId:d.predecessorId,successorId:d.successorId,dependencyType:d.dependencyType,lagDays:d.lagDays,isActive:d.isActive}))).get(t.id);
          context.questionFocusTasks.push({ref,name:redactScheduleText(String(t.name||""),180),description:redactScheduleText(String(t.description||""),260)||null,start:t.expectedStart,end:t.expectedEnd,durationDays:t.durationDays,progress:t.progressPct,status:t.status,targetDate:t.targetDate,critical:!!cpm?.isCritical,slackDays:cpm?.slackDays??null,actualStarted:!!t.actualStart,actualFinished:!!t.actualEnd});
        }
      }
    }
    if(focusResourceIndexes.length){
      const refs=new Set(focusResourceIndexes.slice(0,8).map(i=>`Resource-${String(i+1).padStart(3,"0")}`));
      context.questionFocusResources=context.topResources.filter((r:any)=>refs.has(r.ref));
    }
  }
  const prompt=promptFor(context,safeQuestion);const key=createHash("sha256").update(JSON.stringify({projectId,question:safeQuestion||"brief",model:settings.model,context})).digest("hex");
  if(settings.cacheEnabled){const hit=cache.get(key);if(hit&&hit.expiresAt>Date.now()){await prisma.macUsage.create({data:{organizationId,projectId,settingsId:settings.id,provider:settings.provider,model:settings.model,requestKind:question?"QUESTION":"BRIEF",estimatedCostUsd:0,actualCostUsd:0,cacheHit:true,contextHash:key}});return {...hit.result,cacheHit:true};}}
  const inputTokens=estimateTokens(prompt),outputTokens=Math.min(settings.maxTokensPerRequest,2200);const estimate=estimateCost(settings.provider,settings.model,inputTokens,outputTokens);if(estimate===null)throw Object.assign(new Error("MAC pricing is not configured for this model. Set a known-cost model before enabling requests."),{code:"MAC_PRICING_UNKNOWN",statusCode:400});if(estimate>settings.maxRequestCostUsd)throw Object.assign(new Error(`MAC blocked this request because its estimated cost exceeds the per-request limit ($${settings.maxRequestCostUsd.toFixed(4)}).`),{code:"MAC_COST_LIMIT",statusCode:429});
  const totals=await usageTotals(organizationId);if(totals.daily+estimate>settings.dailyBudgetUsd||totals.monthly+estimate>settings.monthlyBudgetUsd)throw Object.assign(new Error("MAC blocked this request because the configured AI budget has been reached."),{code:"MAC_BUDGET_EXCEEDED",statusCode:429});
  const out=await callModel(settings.provider,settings.model,prompt,outputTokens);const actual=estimateCost(settings.provider,settings.model,out.inputTokens,out.outputTokens)??estimate;const refMap=new Map<string,string>();tasks.forEach((t,i)=>refMap.set(`Task-${String(i+1).padStart(3,"0")}`,t.id));const result:any=normalize(parseJson(out.text),settings.provider,settings.model,refMap,actual);
  result.answer=resolveResourceRefs(result.answer,resources);
  result.answer=redactScheduleText(result.answer,2400);
  result.executiveSummary=resolveResourceRefs(result.executiveSummary,resources);
  result.outlook=resolveResourceRefs(result.outlook,resources);
  result.priorities=result.priorities.map((v:string)=>resolveResourceRefs(v,resources));
  result.insights=result.insights.map((i:any)=>({...i,title:resolveResourceRefs(i.title,resources),summary:resolveResourceRefs(i.summary,resources),why:resolveResourceRefs(i.why,resources),actions:i.actions.map((a:string)=>resolveResourceRefs(a,resources))}));
  result.evidence={project:context.project,scale:context.scale,deterministic:context.deterministic,tasks:context.topTasks.slice(0,8),resources:context.topResources.slice(0,8),dependencies:context.dependencies.slice(0,12)};
  await prisma.macUsage.create({data:{organizationId,projectId,settingsId:settings.id,provider:settings.provider,model:settings.model,requestKind:question?"QUESTION":"BRIEF",inputTokens:out.inputTokens,outputTokens:out.outputTokens,estimatedCostUsd:estimate,actualCostUsd:actual,cacheHit:false,contextHash:key}});
  if(settings.cacheEnabled)cache.set(key,{expiresAt:Date.now()+15*60_000,result});
  if(!question){await prisma.insight.create({data:{projectId,kind:"SUMMARY",confidence:0.8,payload:{...result,mac:true}}});for(const item of result.insights.slice(0,5))await prisma.insight.create({data:{projectId,kind:"SUGGESTION",confidence:item.severity==="CRITICAL"?0.95:item.severity==="HIGH"?0.85:0.7,payload:{...item,ai:true,mac:true,fingerprint:createHash("sha256").update(JSON.stringify(item)).digest("hex"),generatedAt:result.generatedAt}}});}
  return {...result,cacheHit:false};
}

export async function macAlerts(projectId:string,organizationId:string){const project=await prisma.project.findFirst({where:{id:projectId,organizationId}});if(!project)throw Object.assign(new Error("Project not found"),{statusCode:404,code:"PROJECT_NOT_FOUND"});return prisma.insight.findMany({where:{projectId,kind:"SUGGESTION",payload:{path:["mac"],equals:true}},orderBy:{createdAt:"desc"},take:12});}



type MacScheduleMode = "analyze" | "recommend" | "autonomous";

function redactScheduleText(value:string,max=300){
  return String(value||"").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[redacted-email]").replace(/\b(?:\+?\d[\d ()-]{7,}\d)\b/g,"[redacted-phone]").replace(/https?:\/\/[^\s]+/gi,"[redacted-url]").slice(0,max);
}

function resolveResourceRefs(text:string,resources:any[]){
  let out=String(text||"");
  resources.forEach((r,i)=>{const ref=`Resource-${String(i+1).padStart(3,"0")}`;const name=String(r.name||"").trim();if(name)out=out.replaceAll(ref,name);});
  return out;
}

function scheduleContext(project:any,tasks:any[],deps:any[],resources:any[]){
  // Large-data contract: MAC never needs the browser-sized graph in one prompt.
  // The deterministic engine ranks the project first; MAC receives a material slice
  // plus enough boundary information to understand why those items matter.
  const cpm=computeSchedule(tasks.map(t=>({id:t.id,expectedStart:new Date(t.expectedStart),expectedEnd:new Date(t.expectedEnd),durationDays:t.durationDays,isManualSchedule:t.isManualSchedule,targetDate:t.targetDate})),deps.map(d=>({predecessorId:d.predecessorId,successorId:d.successorId,dependencyType:d.dependencyType,lagDays:d.lagDays,isActive:d.isActive})));
  const pred=new Map<string,number>(),succ=new Map<string,number>();for(const d of deps){pred.set(d.successorId,(pred.get(d.successorId)||0)+1);succ.set(d.predecessorId,(succ.get(d.predecessorId)||0)+1)}
  const assigned=new Set(tasks.flatMap((t:any)=>(t.assignments||[]).map((a:any)=>a.taskId)));
  const now=Date.now();
  const scoreTask=(t:any)=>{const r=cpm.get(t.id);const targetRisk=!!t.targetDate&&!!r&&r.expectedEnd.getTime()>new Date(t.targetDate).getTime();const overdue=!t.actualEnd&&t.progressPct<100&&new Date(t.expectedEnd).getTime()<now;const unassigned=!assigned.has(t.id)&&t.taskType!=="SUMMARY";const degree=(pred.get(t.id)||0)+(succ.get(t.id)||0);return (unassigned?40:0)+(r?.isCritical?32:0)+(targetRisk?26:0)+(overdue?22:0)+Math.max(0,18-(r?.slackDays??18))+Math.min(14,degree*2)};
  const ranked=tasks.map(t=>({task:t,score:scoreTask(t)})).sort((a,b)=>b.score-a.score);
  const focusLimit=tasks.length>=1000?220:tasks.length>=500?180:Math.max(180,tasks.length);
  const focus=ranked.slice(0,focusLimit).map(x=>x.task);const focusIds=new Set(focus.map(t=>t.id));
  const refs=new Map<string,string>();const ids=new Map<string,string>();focus.forEach((t,i)=>{const ref=`Task-${String(i+1).padStart(3,"0")}`;refs.set(t.id,ref);ids.set(ref,t.id)});
  const resourceRefs=new Map<string,string>();const resourceByRef=new Map<string,string>();resources.forEach((r,i)=>{const ref=`Resource-${String(i+1).padStart(3,"0")}`;resourceRefs.set(r.id,ref);resourceByRef.set(ref,r.id)});
  const taskRows=focus.map(t=>({ref:refs.get(t.id),name:redactScheduleText(String(t.name||""),180),description:redactScheduleText(String(t.description||""),260),parentRef:t.parentId?refs.get(t.parentId)||null:null,type:t.taskType,start:t.expectedStart,end:t.expectedEnd,durationDays:t.durationDays,progressPct:t.progressPct,status:t.status,manual:t.isManualSchedule,targetDate:t.targetDate?new Date(t.targetDate).toISOString():null,resources:(t.assignments||[]).map((a:any)=>({ref:resourceRefs.get(a.resourceId)||null,allocationPct:a.allocationPct,role:a.role||null}))}));
  const depRows=deps.filter(d=>focusIds.has(d.predecessorId)&&focusIds.has(d.successorId)).map(d=>({predecessor:refs.get(d.predecessorId),successor:refs.get(d.successorId),type:d.dependencyType,lagDays:d.lagDays}));
  const boundaryDeps=deps.filter(d=>focusIds.has(d.predecessorId)!==focusIds.has(d.successorId)).slice(0,120).map(d=>({inside:focusIds.has(d.predecessorId)?refs.get(d.predecessorId):refs.get(d.successorId)||null,externalTask:true,type:d.dependencyType,lagDays:d.lagDays}));
  const resourceRows=resources.map(r=>{const allocation=(r.assignments||[]).reduce((s:number,a:any)=>s+a.allocationPct,0);return {ref:resourceRefs.get(r.id),name:redactScheduleText(String(r.name||""),160),type:r.type||"OTHER",role:redactScheduleText(String(r.role||""),120)||null,capacityHoursPerDay:r.capacityHoursPerDay,capacityUnits:r.capacityUnits,unitLabel:r.unitLabel,availabilityPct:r.availabilityPct,allocationPct:allocation,availablePct:Math.max(0,(r.availabilityPct||100)-allocation),assignedTaskRefs:(r.assignments||[]).map((a:any)=>refs.get(a.taskId)).filter(Boolean)};}).sort((a,b)=>b.allocationPct-a.allocationPct);
  const unassignedCount=tasks.filter(t=>!assigned.has(t.id)&&t.taskType!=="SUMMARY").length;
  return {project:{startDate:project.startDate,status:project.status},counts:{tasks:tasks.length,dependencies:deps.length,resources:resources.length,unassigned:unassignedCount,focusTasks:focus.length,focusExcluded:Math.max(0,tasks.length-focus.length)},focusMode:tasks.length>=500,focusTaskCount:focus.length,tasks:taskRows,dependencies:depRows,boundaryDependencies:boundaryDeps,resources:resourceRows,refMap:ids,resourceMap:resourceByRef};
}

function plannerPrompt(ctx:any,instruction?:string){
  const publicCtx={project:ctx.project,counts:ctx.counts,tasks:ctx.tasks,dependencies:ctx.dependencies,resources:ctx.resources};
  const safeInstruction=redactScheduleText(String(instruction||"").replace(/\s+/g," ").slice(0,2200),2200);
  return `You are MAC, an enterprise schedule reasoning engine. The deterministic server has already indexed the complete project. For large projects, the supplied TASK FOCUS SET is the highest-materiality slice; do not pretend it is the entire project. Hierarchy parentRef is structural only and MUST NOT be converted into a dependency. Existing dependencies are hard scheduling relationships. Actual dates are read-only. Manual schedule anchors must be respected unless the task has no manual anchor. Do not invent facts. Prefer the smallest safe set of high-confidence changes. Never propose self-links, duplicate links, cycles, deletion, actual-date edits, or changes to source-owned actuals.

USER SCHEDULING INTENT (may be empty):
${safeInstruction||"No additional user instruction. Analyze and recommend only evidence-supported improvements."}

Return ONLY JSON in this exact shape:
{"summary":"string","confidence":0.0,"dependencies":[{"predecessorRef":"Task-001","successorRef":"Task-002","type":"FINISH_TO_START|START_TO_START|FINISH_TO_FINISH|START_TO_FINISH","lagDays":0,"confidence":0.0,"reason":"string"}],"dates":[{"taskRef":"Task-001","expectedStart":"YYYY-MM-DD","expectedEnd":"YYYY-MM-DD","confidence":0.0,"reason":"string"}],"resourceAssignments":[{"taskRef":"Task-001","resourceRef":"Resource-001","allocationPct":100,"confidence":0.0,"reason":"string"}],"risks":["string"]}

Execution contract:
- Tier 1 OBSERVE: identify evidence only; do not invent or alter schedule facts.
- Tier 2 DIAGNOSE: explain causes using only supplied evidence and deterministic schedule signals.
- Tier 3 RECOMMEND: propose a minimal, reversible change set; recommendations are not permission to apply.
- Tier 4 EXECUTE: only the server may apply validated proposals after its policy gate; your output itself never authorizes execution.
- If the user's instruction is ambiguous, do not guess the desired scheduling policy. Leave affected proposal arrays empty and explain the missing constraint in risks.
- Treat parentRef as hierarchy/containment only. Never convert it into a predecessor relationship.
- For human-readable summaries, use the supplied task names and resource names. Never expose Resource-* references, internal resource IDs, connector IDs, or other internal identifiers to the user. Keep Resource-* refs only inside structured proposal fields required by the execution contract.
- Never propose changes to actual dates, hierarchy, source credentials, or connector configuration.
- Never propose a resource outside the supplied project resource set.
- Never propose a dependency that would duplicate an existing relationship, self-link, or create a cycle.
- Never fabricate a date merely to make the project appear optimized.

Rules: maximum 80 dependency proposals, 80 date proposals, 40 resource proposals. Confidence must be between 0 and 1. Only propose a dependency when task semantics, hierarchy, dates, status, or existing sequencing provide evidence. A hierarchy parent/child relationship alone is NOT a scheduling dependency. For dates, propose only expected dates and only when a concrete scheduling improvement is justified. For resources, use only supplied resource refs. If evidence is insufficient, leave the array empty.

PROJECT DATA / MATERIALITY INDEX:\n${JSON.stringify({...publicCtx,focusMode:ctx.focusMode,focusTaskCount:ctx.focusTaskCount,boundaryDependencies:ctx.boundaryDependencies})}`;
}

async function macGate(settings:MacSettingsView,prompt:string){
  const inputTokens=estimateTokens(prompt),outputTokens=Math.min(settings.maxTokensPerRequest,6000);const estimate=estimateCost(settings.provider,settings.model,inputTokens,outputTokens);
  if(estimate===null)throw Object.assign(new Error("MAC pricing is not configured for this scheduling model."),{code:"MAC_PRICING_UNKNOWN",statusCode:400});
  if(estimate>settings.maxRequestCostUsd)throw Object.assign(new Error(`MAC blocked this scheduling run because the estimated cost exceeds the per-request limit ($${settings.maxRequestCostUsd.toFixed(4)}).`),{code:"MAC_COST_LIMIT",statusCode:429});
  const totals=await usageTotalsForScheduler(settings);
  if(totals.daily+estimate>settings.dailyBudgetUsd||totals.monthly+estimate>settings.monthlyBudgetUsd)throw Object.assign(new Error("MAC blocked this scheduling run because the configured AI budget has been reached."),{code:"MAC_BUDGET_EXCEEDED",statusCode:429});
  return {inputTokens,outputTokens,estimate};
}

async function usageTotalsForScheduler(settings:MacSettingsView){
  // Organization is supplied by the caller through the temporary property below.
  const orgId=(settings as any).__organizationId as string;
  return usageTotals(orgId);
}

export async function runMacSchedulePlanner(projectId:string,organizationId:string,mode:MacScheduleMode="recommend",instruction?:string){
  const settings:any=await settingsFor(organizationId);settings.__organizationId=organizationId;
  if(!settings.enabled)throw Object.assign(new Error("MAC is disabled by workspace policy."),{code:"MAC_DISABLED",statusCode:403});
  if(!keyFor(settings.provider))throw Object.assign(new Error(`MAC provider is not configured. Set ${settings.provider==="gemini"?"GEMINI_API_KEY":"OPENAI_API_KEY"}.`),{code:"MAC_KEY_MISSING",statusCode:503});
  if(mode==="autonomous" && !settings.autonomousScheduling)throw Object.assign(new Error("Autonomous scheduling is disabled in MAC Studio. Enable it explicitly before applying AI schedule changes."),{code:"MAC_AUTONOMOUS_SCHEDULING_DISABLED",statusCode:403});
  const project=await prisma.project.findFirst({where:{id:projectId,organizationId}});if(!project)throw Object.assign(new Error("Project not found"),{statusCode:404,code:"PROJECT_NOT_FOUND"});
  const [tasks,deps,resources]=await Promise.all([
    prisma.task.findMany({where:{projectId},include:{assignments:true},orderBy:{sortOrder:"asc"}}),
    prisma.dependency.findMany({where:{projectId,isActive:true}}),
    prisma.resource.findMany({
      where:{
        organizationId,
        OR:[
          { projectLinks:{ some:{ projectId, active:true } } },
          { assignments:{ some:{ task:{ projectId } } } },
        ],
      },
      include:{assignments:{where:{task:{projectId}}}},
      orderBy:{name:"asc"},
    }),
  ]);
  const ctx=scheduleContext(project,tasks,deps,resources);
  const prompt=plannerPrompt(ctx,instruction);
  const gate=await macGate(settings,prompt);
  const run=await prisma.aiScheduleRun.create({data:{organizationId,projectId,mode,status:"RUNNING",provider:settings.provider,model:settings.model,taskCount:tasks.length,estimatedCostUsd:gate.estimate}});
  try{
    const out=await callModel(settings.provider,settings.model,prompt,gate.outputTokens);const actual=estimateCost(settings.provider,settings.model,out.inputTokens,out.outputTokens)??gate.estimate;
    const raw=parseJson(out.text);const confidence=Math.max(0,Math.min(1,Number(raw?.confidence??0)));const taskMap=ctx.refMap as Map<string,string>;const resourceMap=ctx.resourceMap as Map<string,string>;
    const validDeps:any[]=[];const validDates:any[]=[];const validResources:any[]=[];const existingPairs=new Set(deps.map(d=>`${d.predecessorId}|${d.successorId}`));
    for(const d of Array.isArray(raw?.dependencies)?raw.dependencies.slice(0,80):[]){const pred=taskMap.get(String(d?.predecessorRef));const succ=taskMap.get(String(d?.successorRef));const type=["FINISH_TO_START","START_TO_START","FINISH_TO_FINISH","START_TO_FINISH"].includes(String(d?.type))?String(d.type):"FINISH_TO_START";const lag=Math.max(-365,Math.min(365,Number(d?.lagDays)||0));const c=Math.max(0,Math.min(1,Number(d?.confidence??0)));if(pred&&succ&&pred!==succ&&!existingPairs.has(`${pred}|${succ}`)&&c>=0.75)validDeps.push({predecessorId:pred,successorId:succ,dependencyType:type,lagDays:lag,confidence:c,reason:String(d?.reason||"").slice(0,500),predecessorRef:d.predecessorRef,successorRef:d.successorRef});}
    for(const d of Array.isArray(raw?.dates)?raw.dates.slice(0,80):[]){const id=taskMap.get(String(d?.taskRef));if(!id)continue;const task=tasks.find(t=>t.id===id);if(!task||task.taskType==="SUMMARY"||task.isManualSchedule)continue;const start=new Date(String(d?.expectedStart||""));const end=new Date(String(d?.expectedEnd||""));const c=Math.max(0,Math.min(1,Number(d?.confidence??0)));if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||start.getUTCFullYear()<1901||end.getUTCFullYear()<1901||start.getUTCFullYear()>2100||end.getUTCFullYear()>2100||end<start||end.getTime()-start.getTime()>3650*DAY||c<0.8)continue;validDates.push({taskId:id,expectedStart:start,expectedEnd:end,confidence:c,reason:String(d?.reason||"").slice(0,500),taskRef:d.taskRef});}
    for(const a of Array.isArray(raw?.resourceAssignments)?raw.resourceAssignments.slice(0,40):[]){const taskId=taskMap.get(String(a?.taskRef));const resourceId=resourceMap.get(String(a?.resourceRef));const task=tasks.find(t=>t.id===taskId);if(!taskId||!resourceId||!task)continue;const c=Math.max(0,Math.min(1,Number(a?.confidence??0)));if(c<0.85)continue;validResources.push({taskId,resourceId,allocationPct:Math.max(1,Math.min(100,Number(a?.allocationPct)||100)),confidence:c,reason:String(a?.reason||"").slice(0,500),taskRef:a.taskRef,resourceRef:a.resourceRef});}
    const changes:any={userInstruction:redactScheduleText(String(instruction||""),2200),focusMode:ctx.focusMode,focusTaskCount:ctx.focusTaskCount,focusExcluded:ctx.counts.focusExcluded,summary:resolveResourceRefs(String(raw?.summary||"MAC schedule analysis completed").slice(0,1600),resources),confidence,dependencies:validDeps,dates:validDates,resourceAssignments:validResources,risks:Array.isArray(raw?.risks)?raw.risks.map((x:any)=>resolveResourceRefs(String(x),resources)).slice(0,12):[],appliedDependencyIds:[],baseline:{tasks:tasks.map(t=>({id:t.id,expectedStart:t.expectedStart.toISOString(),expectedEnd:t.expectedEnd.toISOString(),isManualSchedule:t.isManualSchedule})),dependencies:deps.map(d=>({predecessorId:d.predecessorId,successorId:d.successorId,dependencyType:d.dependencyType,lagDays:d.lagDays})),assignments:tasks.flatMap(t=>(t.assignments||[]).map((a:any)=>({taskId:t.id,resourceId:a.resourceId,allocationPct:a.allocationPct,role:a.role||null})))}};
    let appliedDeps=0,appliedDates=0,appliedResources=0;let snapshotId:string|null=null;const appliedDependencyIds:string[]=[];
    if(mode==="autonomous"){
      const snapshot=await prisma.scheduleSnapshot.create({data:{projectId,label:`MAC Schedule Run ${run.id}`,taskStateJson:tasks.map(t=>({id:t.id,expectedStart:t.expectedStart,expectedEnd:t.expectedEnd,durationDays:t.durationDays,actualStart:t.actualStart,actualEnd:t.actualEnd,isManualSchedule:t.isManualSchedule,taskType:t.taskType,parentId:t.parentId}))}});snapshotId=snapshot.id;
      const addedDeps:string[]=[];try{
        if(settings.autoApplyDependencies){
          for(const d of validDeps){const duplicate=await prisma.dependency.findFirst({where:{projectId,predecessorId:d.predecessorId,successorId:d.successorId,isActive:true}});if(duplicate)continue;const dep=await prisma.dependency.create({data:{projectId,predecessorId:d.predecessorId,successorId:d.successorId,dependencyType:d.dependencyType,lagDays:d.lagDays,isActive:true}});addedDeps.push(dep.id);appliedDependencyIds.push(dep.id);await prisma.task.update({where:{id:d.successorId},data:{isManualSchedule:false}});appliedDeps++;}
        }
        if(settings.autoOptimizeDates){
          for(const d of validDates){await prisma.task.update({where:{id:d.taskId},data:{expectedStart:d.expectedStart,expectedEnd:d.expectedEnd,durationDays:Math.max(1,Math.round((d.expectedEnd.getTime()-d.expectedStart.getTime())/DAY)),isManualSchedule:false}});appliedDates++;}
        }
        if(settings.allowResourceReassignment){
          for(const a of validResources){await prisma.assignment.upsert({where:{taskId_resourceId:{taskId:a.taskId,resourceId:a.resourceId}},create:{taskId:a.taskId,resourceId:a.resourceId,allocationPct:a.allocationPct,role:"MAC"},update:{allocationPct:a.allocationPct,role:"MAC"}});appliedResources++;}
        }
        await recomputeProjectSchedule(prisma,projectId);
        const validation=await prisma.dependency.findMany({where:{projectId,isActive:true}});const testTasks=await prisma.task.findMany({where:{projectId}});computeSchedule(testTasks.map(t=>({id:t.id,expectedStart:t.expectedStart,expectedEnd:t.expectedEnd,durationDays:t.durationDays,isManualSchedule:t.isManualSchedule,targetDate:t.targetDate})),validation.map(d=>({predecessorId:d.predecessorId,successorId:d.successorId,dependencyType:d.dependencyType,lagDays:d.lagDays,isActive:d.isActive})));
      }catch(error){
        for(const id of addedDeps)await prisma.dependency.delete({where:{id}}).catch(()=>undefined);
        for(const t of tasks)await prisma.task.update({where:{id:t.id},data:{expectedStart:t.expectedStart,expectedEnd:t.expectedEnd,durationDays:t.durationDays,isManualSchedule:t.isManualSchedule}}).catch(()=>undefined);
        await recomputeProjectSchedule(prisma,projectId).catch(()=>undefined);throw error;
      }
    }
    changes.appliedDependencyIds=appliedDependencyIds;
    const persistedChanges={...changes,dates:validDates.map((d:any)=>({...d,expectedStart:d.expectedStart.toISOString(),expectedEnd:d.expectedEnd.toISOString()})),snapshotId};
    await prisma.macUsage.create({data:{organizationId,projectId,settingsId:settings.id,provider:settings.provider,model:settings.model,requestKind:"SCHEDULE",inputTokens:out.inputTokens,outputTokens:out.outputTokens,estimatedCostUsd:gate.estimate,actualCostUsd:actual,cacheHit:false,contextHash:createHash("sha256").update(prompt).digest("hex")}});
    await prisma.aiScheduleRun.update({where:{id:run.id},data:{status:mode==="autonomous"?"APPLIED":"RECOMMENDED",dependencyProposals:validDeps.length,dependenciesApplied:appliedDeps,datesProposed:validDates.length,datesApplied:appliedDates,resourceProposals:validResources.length,resourceAssignmentsApplied:appliedResources,actualCostUsd:actual,summary:changes.summary,changes:persistedChanges,completedAt:new Date()}});
    return {runId:run.id,mode,status:mode==="autonomous"?"APPLIED":"RECOMMENDED",projectId,taskCount:tasks.length,dependencyProposals:validDeps.length,dependenciesApplied:appliedDeps,datesProposed:validDates.length,datesApplied:appliedDates,resourceProposals:validResources.length,resourceAssignmentsApplied:appliedResources,summary:changes.summary,confidence,risks:changes.risks,changes:persistedChanges,snapshotId,estimatedCostUsd:gate.estimate,actualCostUsd:actual};
  }catch(error){
    await prisma.aiScheduleRun.update({where:{id:run.id},data:{status:"FAILED",error:String(error instanceof Error?error.message:"MAC scheduling failed"),completedAt:new Date()}}).catch(()=>undefined);throw error;
  }
}


export async function applyMacScheduleRun(projectId:string,organizationId:string,runId:string){
  const settings:any=await settingsFor(organizationId);
  const run=await prisma.aiScheduleRun.findFirst({where:{id:runId,projectId,organizationId,status:"RECOMMENDED"}});
  if(!run)throw Object.assign(new Error("A recommended MAC schedule run was not found."),{code:"MAC_RECOMMENDATION_NOT_FOUND",statusCode:404});
  const latest=await prisma.aiScheduleRun.findFirst({where:{projectId,organizationId,status:{in:["RECOMMENDED","APPLIED"]}},orderBy:{createdAt:"desc"}});
  if(latest?.id!==run.id)throw Object.assign(new Error("Only the latest MAC recommendation can be applied."),{code:"MAC_RECOMMENDATION_STALE",statusCode:409});
  const changes:any=run.changes||{};
  const baseline=changes.baseline||{};
  const snapshot=await prisma.scheduleSnapshot.create({data:{projectId,label:`MAC Approved Change Set ${run.id}`,taskStateJson:Array.isArray(baseline.tasks)?baseline.tasks:[]}});
  const addedDeps:string[]=[];
  try{
    const validDeps=Array.isArray(changes.dependencies)?changes.dependencies:[];
    for(const d of validDeps){
      const duplicate=await prisma.dependency.findFirst({where:{projectId,predecessorId:d.predecessorId,successorId:d.successorId,isActive:true}});
      if(duplicate)continue;
      const dep=await prisma.dependency.create({data:{projectId,predecessorId:d.predecessorId,successorId:d.successorId,dependencyType:d.dependencyType,lagDays:d.lagDays,isActive:true}});
      addedDeps.push(dep.id);
    }
    const dates=Array.isArray(changes.dates)?changes.dates:[];
    for(const d of dates){
      const task=await prisma.task.findFirst({where:{id:d.taskId,projectId}});
      if(!task||task.taskType==="SUMMARY"||task.isManualSchedule)continue;
      const start=new Date(d.expectedStart),end=new Date(d.expectedEnd);
      if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<start)continue;
      await prisma.task.update({where:{id:task.id},data:{expectedStart:start,expectedEnd:end,durationDays:Math.max(1,Math.round((end.getTime()-start.getTime())/DAY)),isManualSchedule:false}});
    }
    const resourceChanges=Array.isArray(changes.resourceAssignments)?changes.resourceAssignments:[];
    if(settings.allowResourceReassignment){
      for(const a of resourceChanges){
        const task=await prisma.task.findFirst({where:{id:a.taskId,projectId}}); if(!task)continue;
        const resource=await prisma.resource.findFirst({where:{id:a.resourceId,organizationId}}); if(!resource)continue;
        await prisma.assignment.upsert({where:{taskId_resourceId:{taskId:a.taskId,resourceId:a.resourceId}},create:{taskId:a.taskId,resourceId:a.resourceId,allocationPct:Math.max(1,Math.min(100,Number(a.allocationPct)||100)),role:"MAC"},update:{allocationPct:Math.max(1,Math.min(100,Number(a.allocationPct)||100)),role:"MAC"}});
      }
    }
    await recomputeProjectSchedule(prisma,projectId);
    const validation=await prisma.dependency.findMany({where:{projectId,isActive:true}});
    const testTasks=await prisma.task.findMany({where:{projectId}});
    computeSchedule(testTasks.map(t=>({id:t.id,expectedStart:t.expectedStart,expectedEnd:t.expectedEnd,durationDays:t.durationDays,isManualSchedule:t.isManualSchedule,targetDate:t.targetDate})),validation.map(d=>({predecessorId:d.predecessorId,successorId:d.successorId,dependencyType:d.dependencyType,lagDays:d.lagDays,isActive:d.isActive})));
    const nextChanges={...changes,appliedDependencyIds:addedDeps,snapshotId:snapshot.id};
    await prisma.aiScheduleRun.update({where:{id:run.id},data:{status:"APPLIED",dependenciesApplied:addedDeps.length,datesApplied:Array.isArray(changes.dates)?changes.dates.length:0,resourceAssignmentsApplied:settings.allowResourceReassignment?resourceChanges.length:0,changes:nextChanges,completedAt:new Date()}});
    return {ok:true,runId:run.id,status:"APPLIED",projectId,snapshotId:snapshot.id,dependenciesApplied:addedDeps.length,datesApplied:Array.isArray(changes.dates)?changes.dates.length:0,resourceAssignmentsApplied:settings.allowResourceReassignment?resourceChanges.length:0};
  }catch(error){
    for(const id of addedDeps)await prisma.dependency.delete({where:{id}}).catch(()=>undefined);
    const tasks=Array.isArray(baseline.tasks)?baseline.tasks:[];
    for(const t of tasks)await prisma.task.update({where:{id:t.id},data:{expectedStart:new Date(t.expectedStart),expectedEnd:new Date(t.expectedEnd),durationDays:Math.max(1,Number(t.durationDays)||1),isManualSchedule:Boolean(t.isManualSchedule)}}).catch(()=>undefined);
    await recomputeProjectSchedule(prisma,projectId).catch(()=>undefined);
    throw error;
  }
}

export async function macScheduleRuns(projectId:string,organizationId:string){
  const project=await prisma.project.findFirst({where:{id:projectId,organizationId}});if(!project)throw Object.assign(new Error("Project not found"),{statusCode:404,code:"PROJECT_NOT_FOUND"});
  return prisma.aiScheduleRun.findMany({where:{projectId,organizationId},orderBy:{createdAt:"desc"},take:20,select:{id:true,mode:true,status:true,provider:true,model:true,taskCount:true,dependencyProposals:true,dependenciesApplied:true,datesProposed:true,datesApplied:true,resourceProposals:true,resourceAssignmentsApplied:true,estimatedCostUsd:true,actualCostUsd:true,summary:true,createdAt:true,completedAt:true,error:true}});
}

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
