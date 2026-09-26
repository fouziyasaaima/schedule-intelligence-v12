import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import dns from "node:dns/promises";
const prisma:any = {};

export type EntityType = "project" | "task" | "resource";
export type ConnectorConfig = {
  operations?: Record<string, { method: string; path: string; enabled?: boolean }>;
  targetProjectId?: string | null;
  pagination?: { mode?: "none" | "page" | "cursor"; pageParam?: string; pageSizeParam?: string; pageSize?: number; cursorPath?: string; nextCursorPath?: string };
  response?: { itemsPath?: string; idField?: string };
  sync?: { entities?: EntityType[]; conflict?: "external_wins" | "si_wins" | "latest" | "manual"; intervalMinutes?: number };
  oauth?: { authorizeUrl?: string; tokenUrl?: string; clientId?: string; scopes?: string; audience?: string; redirectUri?: string };
  headers?: Record<string,string>;
};

type Secrets = { apiKey?: string; bearerToken?: string; username?: string; password?: string; clientSecret?: string; accessToken?: string; refreshToken?: string; accessTokenExpiresAt?: number; customHeaders?: Record<string,string> };

const key = () => {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY || "";
  if (!raw) throw Object.assign(new Error("CONNECTOR_ENCRYPTION_KEY is required for connector secrets"), { code: "CONNECTOR_ENCRYPTION_KEY_MISSING", statusCode: 503 });
  const hex = raw.length === 64 && /^[0-9a-f]+$/i.test(raw) ? raw : createHash("sha256").update(raw).digest("hex");
  return Buffer.from(hex, "hex");
};
function encrypt(value: unknown) {
  const iv=randomBytes(12); const cipher=createCipheriv("aes-256-gcm",key(),iv); const data=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),data.toString("base64url")].join(".");
}
function decrypt<T=Secrets>(value?: string|null): T { if(!value) return {} as T; const [iv,tag,data]=value.split("."); const decipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64url")); decipher.setAuthTag(Buffer.from(tag,"base64url")); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8")); }
export const hashToken=(v:string)=>createHash("sha256").update(v).digest("hex");

function getPath(obj:any,path:string){ return path.split(".").filter(Boolean).reduce((v,k)=>v==null?undefined:v[k],obj); }
function setPath(obj:any,path:string,value:any){ const parts=path.split(".").filter(Boolean); let cur=obj; parts.forEach((p,i)=>{if(i===parts.length-1)cur[p]=value;else cur=cur[p]??={};}); return obj; }
function isPrivateAddress(address:string){return /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(address)||/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address)||address==="::1"||address.startsWith("fc")||address.startsWith("fd")||address.startsWith("fe80:");}
async function validateAbsoluteExternalUrl(rawUrl:string){
  const u=new URL(rawUrl);
  if(!["http:","https:"].includes(u.protocol))throw Object.assign(new Error("Connector destination must use HTTP or HTTPS"),{code:"CONNECTOR_PROTOCOL_BLOCKED",statusCode:400});
  if(["localhost","localhost.localdomain"].includes(u.hostname)||u.hostname.endsWith(".local"))throw Object.assign(new Error("Private/local connector destinations are blocked"),{code:"CONNECTOR_PRIVATE_HOST_BLOCKED",statusCode:400});
  try{const answers=await dns.lookup(u.hostname,{all:true});if(answers.some((a:any)=>isPrivateAddress(a.address)))throw Object.assign(new Error("Connector destination resolves to a private address"),{code:"CONNECTOR_PRIVATE_ADDRESS_BLOCKED",statusCode:400});}
  catch(e:any){if(e.code?.startsWith("CONNECTOR_"))throw e;throw Object.assign(new Error("Unable to resolve connector destination"),{code:"CONNECTOR_DNS_FAILED",statusCode:400});}
}

async function readJsonObject(res:Response):Promise<Record<string,unknown>>{
  const text=await res.text();
  if(!text)return {};
  try{const value:unknown=JSON.parse(text);return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
  catch{return {};}
}

async function validateOutboundUrl(baseUrl:string,path:string){
  if(/^https?:\/\//i.test(path))throw Object.assign(new Error("Connector paths must be relative to the configured base URL"),{code:"CONNECTOR_ABSOLUTE_URL_BLOCKED",statusCode:400});
  await validateAbsoluteExternalUrl(baseUrl);
}


function applyTransform(value:any,t:any={}){
  if(value==null && t.default!==undefined)return t.default;
  if(t.type==="date") { const d=new Date(value); return Number.isNaN(d.getTime())?value:d.toISOString(); }
  if(t.type==="number") { const n=Number(value); return Number.isFinite(n)?n:value; }
  if(t.type==="boolean") return value===true||value===1||value==="1"||String(value).toLowerCase()==="true";
  if(t.type==="lowercase" && typeof value==="string")return value.toLowerCase();
  if(t.type==="uppercase" && typeof value==="string")return value.toUpperCase();
  if(t.type==="enum" && t.values && Object.prototype.hasOwnProperty.call(t.values,String(value)))return t.values[String(value)];
  return value;
}

async function ensureOAuthAccessToken(conn:any){
  if(!String(conn.authType||"").startsWith("OAUTH2"))return;
  const current=decrypt<Secrets>(conn.secretCiphertext);
  const cfg=conn.config as ConnectorConfig;const oauth=cfg.oauth||{};
  if(current.accessToken && (!current.accessTokenExpiresAt || current.accessTokenExpiresAt > Date.now()+60_000))return;
  if(conn.authType==="OAUTH2_CLIENT_CREDENTIALS"){
    if(!oauth.tokenUrl||!oauth.clientId||!current.clientSecret)throw Object.assign(new Error("OAuth client credentials are incomplete"),{code:"OAUTH_CONFIGURATION_INCOMPLETE",statusCode:400});
    const form=new URLSearchParams({grant_type:"client_credentials",client_id:oauth.clientId,client_secret:current.clientSecret});if(oauth.scopes)form.set("scope",oauth.scopes);if(oauth.audience)form.set("audience",oauth.audience);
    await validateAbsoluteExternalUrl(oauth.tokenUrl);
    const res=await fetch(oauth.tokenUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:form,redirect:"manual",signal:AbortSignal.timeout(20_000)});const data:Record<string,unknown>=await readJsonObject(res);if(res.status>=300&&res.status<400)throw Object.assign(new Error("OAuth token endpoint redirects are not allowed"),{code:"CONNECTOR_REDIRECT_BLOCKED",statusCode:502});if(!res.ok||typeof data.access_token!=="string"||!data.access_token)throw Object.assign(new Error("OAuth client-credentials token exchange failed"),{code:"OAUTH_TOKEN_EXCHANGE_FAILED",statusCode:502,details:data});
    const expiresIn=typeof data.expires_in==="number"?data.expires_in:3600;const nextSecrets={...current,accessToken:data.access_token as string,accessTokenExpiresAt:Date.now()+expiresIn*1000};const ciphertext=encrypt(nextSecrets);await prisma.connector.update({where:{id:conn.id},data:{secretCiphertext:ciphertext}});conn.secretCiphertext=ciphertext;return;
  }
  if(!current.refreshToken)throw Object.assign(new Error("Google/Authorization Code access has expired. Re-authorize the connection."),{code:"OAUTH_REAUTH_REQUIRED",statusCode:401});
  if(!oauth.tokenUrl||!oauth.clientId||!current.clientSecret)throw Object.assign(new Error("OAuth configuration is incomplete"),{code:"OAUTH_CONFIGURATION_INCOMPLETE",statusCode:400});
  await validateAbsoluteExternalUrl(oauth.tokenUrl);
  const form=new URLSearchParams({grant_type:"refresh_token",refresh_token:current.refreshToken,client_id:oauth.clientId,client_secret:current.clientSecret});
  const res=await fetch(oauth.tokenUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:form,redirect:"manual",signal:AbortSignal.timeout(20_000)});const data:Record<string,unknown>=await readJsonObject(res);if(res.status>=300&&res.status<400)throw Object.assign(new Error("OAuth token endpoint redirects are not allowed"),{code:"CONNECTOR_REDIRECT_BLOCKED",statusCode:502});if(!res.ok||typeof data.access_token!=="string"||!data.access_token)throw Object.assign(new Error("OAuth refresh failed. Re-authorize the connection."),{code:"OAUTH_REAUTH_REQUIRED",statusCode:401,details:data});
  const expiresIn=typeof data.expires_in==="number"?data.expires_in:3600;const nextSecrets={...current,accessToken:data.access_token as string,refreshToken:typeof data.refresh_token==="string"?data.refresh_token:current.refreshToken,accessTokenExpiresAt:Date.now()+expiresIn*1000};const ciphertext=encrypt(nextSecrets);await prisma.connector.update({where:{id:conn.id},data:{secretCiphertext:ciphertext,status:"CONNECTED",lastError:null}});conn.secretCiphertext=ciphertext;
}

async function requestExternal(conn:any, method:string, path:string, body?:any, query?:Record<string,string>){
  await validateOutboundUrl(conn.baseUrl,path);
  await ensureOAuthAccessToken(conn);
  const secrets=decrypt<Secrets>(conn.secretCiphertext); const cfg=conn.config as ConnectorConfig; const url=new URL(path,conn.baseUrl.endsWith("/")?conn.baseUrl:conn.baseUrl+"/");
  if(query)for(const [k,v] of Object.entries(query))if(v!=null)url.searchParams.set(k,v);
  const headers:Record<string,string>={Accept:"application/json",...(cfg.headers||{}),...(secrets.customHeaders||{})};
  if(body!==undefined){headers["Content-Type"]="application/json";}
  if(conn.authType==="API_KEY") headers["X-API-Key"]=secrets.apiKey||"";
  if(conn.authType==="BEARER" || conn.authType?.startsWith("OAUTH2")) headers.Authorization=`Bearer ${secrets.accessToken||secrets.bearerToken||""}`;
  if(conn.authType==="BASIC") headers.Authorization=`Basic ${Buffer.from(`${secrets.username||""}:${secrets.password||""}`).toString("base64")}`;
  const res=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(25_000)});
  const text=await res.text(); let data:any; try{data=text?JSON.parse(text):null}catch{data=text;}
  if(res.status>=300&&res.status<400)throw Object.assign(new Error("External API redirects are not allowed"),{code:"CONNECTOR_REDIRECT_BLOCKED",statusCode:502});
  if(!res.ok)throw Object.assign(new Error(`External API returned ${res.status}`),{code:"CONNECTOR_EXTERNAL_ERROR",statusCode:502,details:data});
  return data;
}

function extractItems(data:any,cfg:ConnectorConfig){ const p=cfg.response?.itemsPath; const v=p?getPath(data,p):data; if(Array.isArray(v))return v; if(v&&Array.isArray(v.items))return v.items; if(v&&Array.isArray(v.data))return v.data; return v?[v]:[]; }
function externalId(item:any,cfg:ConnectorConfig){return String(getPath(item,cfg.response?.idField||"id")??"");}

async function mappingsFor(connectorId:string,entityType:EntityType,direction:string){return prisma.connectorMapping.findMany({where:{connectorId,entityType,direction:{in:[direction,"BOTH"]}}});}

async function importResources(conn:any, run:any){
  const op=(conn.config as ConnectorConfig).operations?.resourceList; if(!op?.enabled)return;
  const items=extractItems(await requestExternal(conn,op.method||"GET",op.path),conn.config as ConnectorConfig); run.recordsRead+=items.length;
  const maps=await mappingsFor(conn.id,"resource","IMPORT");
  for(const item of items){const eid=externalId(item,conn.config as ConnectorConfig);if(!eid)continue; const values:any={};for(const m of maps)setPath(values,m.internalField,applyTransform(getPath(item,m.externalField),m.transform));
    const name=String(values.name||values.displayName||`Resource ${eid}`); const existing=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"resource",externalId:eid}}});
    const resource=existing?await prisma.resource.update({where:{id:existing.internalId},data:{name,role:values.role??undefined,capacityHoursPerDay:values.capacityHoursPerDay?Number(values.capacityHoursPerDay):undefined}}):await prisma.resource.create({data:{organizationId:conn.organizationId,name,role:values.role??undefined,capacityHoursPerDay:values.capacityHoursPerDay?Number(values.capacityHoursPerDay):8}});
    if(existing)run.recordsUpdated++;else run.recordsCreated++; await prisma.connectorIdentity.upsert({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"resource",externalId:eid}},create:{connectorId:conn.id,entityType:"resource",externalId:eid,internalId:resource.id},update:{internalId:resource.id}});
  }
}

async function importProjectsAndTasks(conn:any,run:any){
  const cfg=conn.config as ConnectorConfig; const pOp=cfg.operations?.projectList; const tOp=cfg.operations?.taskList; const entities=cfg.sync?.entities||["task"];
  if(entities.includes("project")&&pOp?.enabled){
    const items=extractItems(await requestExternal(conn,pOp.method||"GET",pOp.path),cfg); run.recordsRead+=items.length; const maps=await mappingsFor(conn.id,"project","IMPORT");
    for(const item of items){const eid=externalId(item,cfg);if(!eid)continue;const v:any={};for(const m of maps)setPath(v,m.internalField,applyTransform(getPath(item,m.externalField),m.transform));const name=String(v.name||`Project ${eid}`);const start=new Date(v.startDate||Date.now());const existing=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"project",externalId:eid}}});const project=existing?await prisma.project.update({where:{id:existing.internalId},data:{name,description:v.description??undefined,startDate:Number.isNaN(start.getTime())?new Date():start}}):await prisma.project.create({data:{organizationId:conn.organizationId,name,description:v.description??undefined,startDate:Number.isNaN(start.getTime())?new Date():start}});if(existing)run.recordsUpdated++;else run.recordsCreated++;await prisma.connectorIdentity.upsert({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"project",externalId:eid}},create:{connectorId:conn.id,entityType:"project",externalId:eid,internalId:project.id},update:{internalId:project.id}});
    }
  }
  if(entities.includes("task")&&tOp?.enabled){
    const target=cfg.targetProjectId; if(!target)throw Object.assign(new Error("A target project is required for task synchronization"),{code:"CONNECTOR_TARGET_PROJECT_REQUIRED",statusCode:400});
    const path=tOp.path.replace("{projectId}",encodeURIComponent(target)); const items=extractItems(await requestExternal(conn,tOp.method||"GET",path),cfg);run.recordsRead+=items.length;const maps=await mappingsFor(conn.id,"task","IMPORT");
    for(const item of items){const eid=externalId(item,cfg);if(!eid)continue;const v:any={};for(const m of maps)setPath(v,m.internalField,applyTransform(getPath(item,m.externalField),m.transform));const start=new Date(v.expectedStart),end=new Date(v.expectedEnd);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())){run.recordsFailed++;continue;}const existing=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"task",externalId:eid}}});const data:any={projectId:target,name:String(v.name||`Task ${eid}`),expectedStart:start,expectedEnd:end,durationDays:Math.max(1,Math.round((end.getTime()-start.getTime())/86400000)),description:v.description??undefined,progressPct:v.progressPct==null?0:Number(v.progressPct),status:v.status||"ACTIVE"};const task=existing?await prisma.task.update({where:{id:existing.internalId},data}):await prisma.task.create({data:{...data,isManualSchedule:false}});if(existing)run.recordsUpdated++;else run.recordsCreated++;await prisma.connectorIdentity.upsert({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"task",externalId:eid}},create:{connectorId:conn.id,entityType:"task",externalId:eid,internalId:task.id},update:{internalId:task.id}});
    }
  }
}

async function importGoogleSheetTasks(conn:any,run:any){
  const cfg=conn.config as ConnectorConfig & {google?:{spreadsheetId?:string;sheetTitle?:string;range?:string;headerRow?:number}};
  const g=cfg.google||{};if(!g.spreadsheetId||!g.sheetTitle)throw Object.assign(new Error("Select a Google spreadsheet and worksheet before syncing"),{code:"GOOGLE_SHEET_NOT_SELECTED",statusCode:400});
  const target=cfg.targetProjectId;if(!target)throw Object.assign(new Error("A target SI project is required for Google Sheets task synchronization"),{code:"CONNECTOR_TARGET_PROJECT_REQUIRED",statusCode:400});
  const range=g.range||`${g.sheetTitle}!A1:Z1000`;const data=await googlePreviewValues(conn.id,conn.organizationId,g.spreadsheetId,range);const rows=(data as any).values||[];const headerIndex=Math.max(0,Number(g.headerRow||1)-1);const headers=(rows[headerIndex]||[]).map((x:any)=>String(x??""));if(!headers.length)throw Object.assign(new Error("The selected Google Sheet does not contain a usable header row"),{code:"GOOGLE_SHEET_HEADERS_MISSING",statusCode:400});
  const maps=await mappingsFor(conn.id,"task","IMPORT");const byExternal=new Map<string,number>();headers.forEach((h:string,i:number)=>byExternal.set(h,i));
  for(const row of rows.slice(headerIndex+1)){if(!row||row.every((v:any)=>String(v??"").trim()===""))continue;run.recordsRead++;const item:any={};for(const m of maps){const i=byExternal.get(m.externalField);if(i!==undefined)item[m.internalField]=applyTransform(row[i],m.transform);}
    const eid=String(item.externalId||"").trim();if(!eid){run.recordsFailed++;continue;}const name=String(item.name||`Task ${eid}`).trim();const start=new Date(String(item.expectedStart||""));const end=new Date(String(item.expectedEnd||""));if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())){run.recordsFailed++;continue;}
    const statusRaw=String(item.status||"ACTIVE").toUpperCase();const status=(['ACTIVE','ON_HOLD','CLOSED','DELAYED'].includes(statusRaw)?statusRaw:'ACTIVE') as any;const progress=Math.max(0,Math.min(100,Number(item.progressPct||0)||0));const data:any={projectId:target,name,expectedStart:start,expectedEnd:end,durationDays:Math.max(1,Math.round((end.getTime()-start.getTime())/86400000)),description:item.description==null?undefined:String(item.description),progressPct:progress,status,isManualSchedule:false};
    const existing=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"task",externalId:eid}}});const task=existing?await prisma.task.update({where:{id:existing.internalId},data}):await prisma.task.create({data});if(existing)run.recordsUpdated++;else run.recordsCreated++;await prisma.connectorIdentity.upsert({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"task",externalId:eid}},create:{connectorId:conn.id,entityType:"task",externalId:eid,internalId:task.id},update:{internalId:task.id}});
    if(item.resourceExternalId){const rid=String(item.resourceExternalId);const identity=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"resource",externalId:rid}}});if(identity){await prisma.assignment.upsert({where:{taskId_resourceId:{taskId:task.id,resourceId:identity.internalId}},create:{taskId:task.id,resourceId:identity.internalId,allocationPct:100},update:{}});}}
  }
}

export async function syncConnector(connectorId:string, organizationId:string){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  const run=await prisma.connectorSyncRun.create({data:{connectorId,direction:conn.direction,status:"RUNNING"}});const mutable:any={recordsRead:0,recordsCreated:0,recordsUpdated:0,recordsFailed:0};
  try{if(conn.direction!=="EXPORT"){if(conn.provider==="google-sheets")await importGoogleSheetTasks(conn,mutable);else{await importResources(conn,mutable);await importProjectsAndTasks(conn,mutable);}}await prisma.connectorSyncRun.update({where:{id:run.id},data:{...mutable,status:"SUCCEEDED",completedAt:new Date()}});await prisma.connector.update({where:{id:conn.id},data:{lastSyncAt:new Date(),lastError:null,status:"CONNECTED"}});return {...mutable,id:run.id,status:"SUCCEEDED"};}
  catch(e:any){await prisma.connectorSyncRun.update({where:{id:run.id},data:{...mutable,status:"FAILED",completedAt:new Date(),error:e.message,details:e.details||{}}});await prisma.connector.update({where:{id:conn.id},data:{lastError:e.message,status:"ERROR"}});throw e;}
}

export async function testConnector(connectorId:string,organizationId:string){const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});if(conn.provider==="google-sheets"){const g=(conn.config as any).google||{};if(!g.spreadsheetId||!g.sheetTitle)throw Object.assign(new Error("Select a Google spreadsheet and worksheet before testing"),{code:"GOOGLE_SHEET_NOT_SELECTED",statusCode:400});const data=await googlePreviewValues(conn.id,conn.organizationId,g.spreadsheetId,g.range||`${g.sheetTitle}!A1:Z10`);await prisma.connector.update({where:{id:conn.id},data:{lastTestedAt:new Date(),status:"CONNECTED",lastError:null}});return {ok:true,status:"CONNECTED",sample:(data as any).values||[]};}const cfg=conn.config as ConnectorConfig;const op=cfg.operations?.projectList||cfg.operations?.taskList||cfg.operations?.resourceList;if(!op?.path)throw Object.assign(new Error("Configure at least one read operation before testing"),{code:"CONNECTOR_OPERATION_MISSING",statusCode:400});const data=await requestExternal(conn,op.method||"GET",op.path);await prisma.connector.update({where:{id:conn.id},data:{lastTestedAt:new Date(),status:"CONNECTED",lastError:null}});return {ok:true,status:"CONNECTED",sample:Array.isArray(data)?data.slice(0,3):data};}

export async function pushTaskUpdate(taskId:string,organizationId:string){
  const task=await prisma.task.findFirst({where:{id:taskId,project:{organizationId}}});if(!task)return;
  const connectors=await prisma.connector.findMany({where:{organizationId,status:"CONNECTED",direction:{in:["EXPORT","BIDIRECTIONAL"]}}});
  for(const conn of connectors){const cfg=conn.config as ConnectorConfig;const op=cfg.operations?.taskUpdate;if(!op?.enabled)continue;const identity=await prisma.connectorIdentity.findFirst({where:{connectorId:conn.id,entityType:"task",internalId:task.id}});if(!identity)continue;const maps=await mappingsFor(conn.id,"task","EXPORT");const payload:any={};for(const m of maps){const value=getPath(task,m.internalField);setPath(payload,m.externalField,applyTransform(value,m.transform));}const path=op.path.replace("{id}",encodeURIComponent(identity.externalId));try{await requestExternal(conn,op.method||"PATCH",path,payload);}catch(e){await prisma.connector.update({where:{id:conn.id},data:{lastError:(e as Error).message,status:"ERROR"}});}}
}

export async function authorizeOAuth(connectorId:string,organizationId:string){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  const cfg=conn.config as ConnectorConfig;const oauth=cfg.oauth||{};if(!oauth.authorizeUrl||!oauth.clientId||!oauth.redirectUri)throw Object.assign(new Error("OAuth authorize URL, client ID and redirect URI are required"),{code:"OAUTH_CONFIGURATION_INCOMPLETE",statusCode:400});
  const raw=randomBytes(32).toString("base64url");await prisma.connectorOAuthState.create({data:{connectorId,stateHash:hashToken(raw),expiresAt:new Date(Date.now()+10*60_000)}});
  const u=new URL(oauth.authorizeUrl);u.searchParams.set("response_type","code");u.searchParams.set("client_id",oauth.clientId);u.searchParams.set("redirect_uri",oauth.redirectUri);u.searchParams.set("state",raw);if(oauth.scopes)u.searchParams.set("scope",oauth.scopes);if(oauth.audience)u.searchParams.set("audience",oauth.audience);if(conn.provider==="google-sheets"){u.searchParams.set("access_type","offline");u.searchParams.set("prompt","consent");}return {url:u.toString()};
}
export async function oauthCallback(code:string,state:string){
  const row=await prisma.connectorOAuthState.findUnique({where:{stateHash:hashToken(state)},include:{connector:true}});if(!row||row.expiresAt<new Date())throw Object.assign(new Error("OAuth state is invalid or expired"),{statusCode:400});
  const conn=row.connector;const cfg=conn.config as ConnectorConfig;const oauth=cfg.oauth||{};const sec=decrypt<Secrets>(conn.secretCiphertext);if(!oauth.tokenUrl||!oauth.clientId||!sec.clientSecret||!oauth.redirectUri)throw Object.assign(new Error("OAuth token configuration is incomplete"),{statusCode:400});
  await validateAbsoluteExternalUrl(oauth.tokenUrl);const form=new URLSearchParams({grant_type:"authorization_code",code,client_id:oauth.clientId,client_secret:sec.clientSecret,redirect_uri:oauth.redirectUri});const res=await fetch(oauth.tokenUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:form,redirect:"manual",signal:AbortSignal.timeout(20_000)});const data: Record<string,unknown>=await readJsonObject(res);if(res.status>=300&&res.status<400)throw Object.assign(new Error("OAuth token endpoint redirects are not allowed"),{code:"CONNECTOR_REDIRECT_BLOCKED",statusCode:502});if(!res.ok||typeof data.access_token!=="string"||!data.access_token)throw Object.assign(new Error("OAuth token exchange failed"),{statusCode:502,details:data});
  const expiresIn=typeof data.expires_in==="number"?data.expires_in:3600;await prisma.connector.update({where:{id:conn.id},data:{secretCiphertext:encrypt({...sec,accessToken:data.access_token as string,accessTokenExpiresAt:Date.now()+expiresIn*1000,refreshToken:typeof data.refresh_token==="string"?data.refresh_token:sec.refreshToken}),status:"CONNECTED",lastTestedAt:new Date(),lastError:null}});await prisma.connectorOAuthState.delete({where:{id:row.id}});return {ok:true,connectorId:conn.id};
}
export async function testWriteOperation(connectorId:string,organizationId:string,operationKey:string,body:any){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});const cfg=conn.config as ConnectorConfig;let op=cfg.operations?.[operationKey];if(!op||!op.enabled||!["POST","PUT","PATCH","DELETE"].includes(op.method))throw Object.assign(new Error("Write operation is not configured and enabled"),{code:"CONNECTOR_WRITE_OPERATION_MISSING",statusCode:400});
  if(op.path.includes("{id}")){const id=String(body?.__testExternalId||"");if(!id)throw Object.assign(new Error("Provide __testExternalId for an endpoint containing {id}"),{statusCode:400});op={...op,path:op.path.replace("{id}",encodeURIComponent(id))};}
  const payload={...body};delete payload.__testExternalId;return {ok:true,method:op.method,path:op.path,response:await requestExternal(conn,op.method,op.path,payload)};
}
export async function createConnector(input:any,organizationId:string){
  const {secrets,...rest}=input;return prisma.connector.create({data:{...rest,organizationId,secretCiphertext:secrets?encrypt(secrets):null}});
}
export async function updateConnector(id:string,organizationId:string,input:any){
  const {secrets,...rest}=input;const existing=await prisma.connector.findFirst({where:{id,organizationId}});if(!existing)throw Object.assign(new Error("Connector not found"),{statusCode:404});return prisma.connector.update({where:{id},data:{...rest,...(secrets?{secretCiphertext:encrypt(secrets)}:{})}});
}
export async function connectorSecretPreview(id:string,organizationId:string){const c=await prisma.connector.findFirst({where:{id,organizationId}});if(!c)throw Object.assign(new Error("Connector not found"),{statusCode:404});const s=decrypt<Secrets>(c.secretCiphertext);return {hasCredential:Boolean(c.secretCiphertext),hasAccessToken:Boolean(s.accessToken||s.bearerToken),authType:c.authType};}
export async function createWebhook(connectorId:string,organizationId:string){const c=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!c)throw Object.assign(new Error("Connector not found"),{statusCode:404});const raw=`wh_${randomBytes(32).toString("base64url")}`;const row=await prisma.connectorWebhook.create({data:{connectorId,tokenHash:hashToken(raw)}});return {id:row.id,token:raw};}
export async function receiveWebhook(token:string,payload:any){const row=await prisma.connectorWebhook.findFirst({where:{tokenHash:hashToken(token),enabled:true},include:{connector:true}});if(!row)throw Object.assign(new Error("Webhook not found"),{statusCode:404});await prisma.connectorWebhook.update({where:{id:row.id},data:{lastReceivedAt:new Date()}});return {connectorId:row.connectorId,organizationId:row.connector.organizationId,payload};}

async function googleRequest(conn:any,url:string,init:RequestInit={}){
  if(conn.provider!=="google-sheets")throw Object.assign(new Error("Google Sheets operations require a Google Sheets connector"),{code:"GOOGLE_PROVIDER_REQUIRED",statusCode:400});
  await ensureOAuthAccessToken(conn);const secrets=decrypt<Secrets>(conn.secretCiphertext);if(!secrets.accessToken)throw Object.assign(new Error("Authorize the Google account first"),{code:"OAUTH_REAUTH_REQUIRED",statusCode:401});
  const res=await fetch(url,{...init,redirect:"manual",headers:{Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{}),...(init.headers||{}),Authorization:`Bearer ${secrets.accessToken}`},signal:AbortSignal.timeout(25_000)});
  const data=await readJsonObject(res);if(res.status>=300&&res.status<400)throw Object.assign(new Error("Google API redirects are not allowed"),{code:"CONNECTOR_REDIRECT_BLOCKED",statusCode:502});if(!res.ok)throw Object.assign(new Error(String((data as any).error?.message||`Google API returned ${res.status}`)),{code:"GOOGLE_API_ERROR",statusCode:res.status===401?401:502,details:data});return data;
}
export async function googleListSpreadsheets(connectorId:string,organizationId:string,query=""){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  const qParts=["mimeType = 'application/vnd.google-apps.spreadsheet'","trashed = false"];if(query.trim())qParts.push(`name contains '${query.replace(/'/g,"\\'")}'`);
  const u=new URL("https://www.googleapis.com/drive/v3/files");u.searchParams.set("q",qParts.join(" and "));u.searchParams.set("pageSize","100");u.searchParams.set("orderBy","modifiedTime desc");u.searchParams.set("fields","files(id,name,mimeType,modifiedTime,webViewLink),nextPageToken");return googleRequest(conn,u.toString());
}
export async function googleGetSpreadsheet(connectorId:string,organizationId:string,spreadsheetId:string){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  const safe=encodeURIComponent(spreadsheetId);const u=`https://sheets.googleapis.com/v4/spreadsheets/${safe}`;return googleRequest(conn,u+"?includeGridData=false&fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))");
}
export async function googlePreviewValues(connectorId:string,organizationId:string,spreadsheetId:string,range:string){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  const u=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);u.searchParams.set("majorDimension","ROWS");u.searchParams.set("valueRenderOption","FORMATTED_VALUE");return googleRequest(conn,u.toString());
}

export { getPath, setPath, encrypt, decrypt, requestExternal };

export async function runScheduledConnectorSyncs(){
  const now=Date.now();const connectors=await prisma.connector.findMany({where:{status:"CONNECTED",direction:{in:["IMPORT","BIDIRECTIONAL"]}}});
  for(const c of connectors){const interval=Number((c.config as ConnectorConfig).sync?.intervalMinutes||0);if(!interval)continue;if(!c.lastSyncAt||now-c.lastSyncAt.getTime()>=interval*60_000){void syncConnector(c.id,c.organizationId).catch(()=>undefined);}}
}
export async function emitConnectorWebhookEvent(organizationId:string,event:string,payload:any){
  const connectors=await prisma.connector.findMany({where:{organizationId,status:"CONNECTED"}});
  for(const c of connectors){const cfg:any=c.config||{};const url=cfg.outboundWebhookUrl;if(!url)continue;try{await requestExternal({...c,baseUrl:url,config:{headers:{"X-SI-Event":event}}},"POST","/",{event,createdAt:new Date().toISOString(),data:payload});}catch(e){await prisma.connector.update({where:{id:c.id},data:{lastError:(e as Error).message,status:"ERROR"}});}}
}
