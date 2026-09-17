import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import dns from "node:dns/promises";
import { prisma } from "../db";
import { recomputeProjectSchedule } from "../scheduling/recompute";

const DAY=86_400_000;

export type EntityType = "project" | "task" | "resource";
export type ConnectorConfig = {
  operations?: Record<string, { method: string; path: string; enabled?: boolean; query?: Record<string,string>; headers?: Record<string,string>; bodyTemplate?: unknown }>;
  targetProjectId?: string | null;
  pagination?: { mode?: "none" | "page" | "cursor"; pageParam?: string; pageSizeParam?: string; pageSize?: number; cursorPath?: string; nextCursorPath?: string };
  response?: { itemsPath?: string; idField?: string };
  sync?: { entities?: EntityType[]; conflict?: "external_wins" | "si_wins" | "latest" | "manual"; intervalMinutes?: number };
  oauth?: { authorizeUrl?: string; tokenUrl?: string; clientId?: string; scopes?: string; audience?: string; redirectUri?: string };
  headers?: Record<string,string>;
  prms?: { projectId?: string; endpoint?: string; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" };
  auth?: {
    apiKey?: { name?: string; location?: "header" | "query"; prefix?: string };
    bearer?: { header?: string; prefix?: string };
    customHeaderNames?: string[];
    customQueryParamNames?: string[];
  };
};

type Secrets = { apiKey?: string; bearerToken?: string; username?: string; password?: string; clientSecret?: string; accessToken?: string; refreshToken?: string; accessTokenExpiresAt?: number; customHeaders?: Record<string,string>; customQueryParams?: Record<string,string> };

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

/**
 * Reconcile connector identities without violating either unique identity key.
 * Older connector versions could keep the same internal resource under a
 * different external key (for example `123` -> `MEMBER:123`). Prisma upsert
 * by externalId alone then fails on @@unique([connectorId, entityType, internalId]).
 */
async function upsertConnectorIdentity(connectorId:string, entityType:EntityType, externalId:string, internalId:string){
  const byExternal=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId,entityType,externalId}}});
  const byInternal=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_internalId:{connectorId,entityType,internalId}}});
  if(byExternal){
    if(byExternal.internalId===internalId)return byExternal;
    if(byInternal && byInternal.id!==byExternal.id)throw Object.assign(new Error(`Connector identity conflict for ${entityType} ${externalId}: external and internal identities point to different records`),{code:"CONNECTOR_IDENTITY_CONFLICT",statusCode:409});
    return prisma.connectorIdentity.update({where:{id:byExternal.id},data:{internalId}});
  }
  if(byInternal)return prisma.connectorIdentity.update({where:{id:byInternal.id},data:{externalId}});
  return prisma.connectorIdentity.create({data:{connectorId,entityType,externalId,internalId}});
}

function getPath(obj:any,path:string){ return path.split(".").filter(Boolean).reduce((v,k)=>v==null?undefined:v[k],obj); }
function setPath(obj:any,path:string,value:any){ const parts=path.split(".").filter(Boolean); let cur=obj; parts.forEach((p,i)=>{if(i===parts.length-1)cur[p]=value;else cur=cur[p]??={};}); return obj; }
function isPrivateAddress(address:string){return /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(address)||/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address)||address==="::1"||address.startsWith("fc")||address.startsWith("fd")||address.startsWith("fe80:");}
function connectorDestinationPolicy():"public"|"private"|"allowlist"{
  const raw=String(process.env.CONNECTOR_DESTINATION_POLICY||"public").toLowerCase();
  return raw==="private"?"private":raw==="allowlist"?"allowlist":"public";
}
function allowedPrivateHosts(){return String(process.env.CONNECTOR_ALLOWED_PRIVATE_HOSTS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);}
async function validateAbsoluteExternalUrl(rawUrl:string){
  const u=new URL(rawUrl);
  if(!["http:","https:"].includes(u.protocol))throw Object.assign(new Error("Connector destination must use HTTP or HTTPS"),{code:"CONNECTOR_PROTOCOL_BLOCKED",statusCode:400});
  const host=u.hostname.toLowerCase();
  const policy=connectorDestinationPolicy();
  const explicitHost=allowedPrivateHosts().includes(host);
  const localHost=host==="localhost"||host==="localhost.localdomain"||host.endsWith(".local");
  if(policy==="public" && (localHost||explicitHost))throw Object.assign(new Error("Private/local connector destinations are disabled. Set CONNECTOR_DESTINATION_POLICY=private for self-hosted local APIs, or add the host to CONNECTOR_ALLOWED_PRIVATE_HOSTS with allowlist policy."),{code:"CONNECTOR_PRIVATE_HOST_BLOCKED",statusCode:400});
  if(policy==="allowlist" && !explicitHost && localHost)throw Object.assign(new Error("This private/local connector host is not allowlisted."),{code:"CONNECTOR_PRIVATE_HOST_BLOCKED",statusCode:400});
  try{const answers=await dns.lookup(u.hostname,{all:true});const privateResolved=answers.some(a=>isPrivateAddress(a.address));if(privateResolved && policy==="public")throw Object.assign(new Error("Connector destination resolves to a private address. Set CONNECTOR_DESTINATION_POLICY=private for self-hosted local APIs, or use allowlist policy."),{code:"CONNECTOR_PRIVATE_ADDRESS_BLOCKED",statusCode:400});if(privateResolved&&policy==="allowlist"&&!explicitHost)throw Object.assign(new Error("Connector destination resolves to a private address that is not allowlisted."),{code:"CONNECTOR_PRIVATE_ADDRESS_BLOCKED",statusCode:400});}
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


type PrmsTokenCache = { token: string; expiresAt: number };
let prmsTokenCache: PrmsTokenCache | null = null;
let prmsTokenInFlight: Promise<string> | null = null;

function envRequired(name:string){
  const value=String(process.env[name]||"").trim();
  if(!value) throw Object.assign(new Error(`${name} is not configured on the API server`),{code:"PRMS_CONFIGURATION_MISSING",statusCode:503});
  return value;
}

function decodeJwtExpiry(token:string){
  try{
    const part=token.split(".")[1];
    if(!part)return null;
    const normalized=part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"=");
    const payload=JSON.parse(Buffer.from(normalized,"base64").toString("utf8"));
    return typeof payload?.exp==="number" ? payload.exp*1000 : null;
  }catch{return null;}
}

async function acquirePrmsAccessToken(force=false){
  if(!force && prmsTokenCache && prmsTokenCache.expiresAt>Date.now()+30_000)return prmsTokenCache.token;
  if(prmsTokenInFlight)return prmsTokenInFlight;
  prmsTokenInFlight=(async()=>{
    const tokenUrl=envRequired("PRMS_TOKEN_URL");
    const clientId=envRequired("PRMS_CLIENT_ID");
    const clientSecret=envRequired("PRMS_CLIENT_SECRET");
    const bootstrapBearer=envRequired("PRMS_BEARER_TOKEN");
    await validateAbsoluteExternalUrl(tokenUrl);
    const res=await fetch(tokenUrl,{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json",Authorization:`Bearer ${bootstrapBearer}`},body:JSON.stringify({ClientId:clientId,ClientSecret:clientSecret}),redirect:"manual",signal:AbortSignal.timeout(20_000)});
    const responseText=await res.text();
    let data:Record<string,unknown>={};
    if(responseText){try{const parsed:unknown=JSON.parse(responseText);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))data=parsed as Record<string,unknown>;}catch{}}
    if(res.status>=300&&res.status<400)throw Object.assign(new Error(`PRMS token endpoint redirected (${res.status}) at ${tokenUrl}. Redirects are intentionally blocked for credential safety.`),{code:"CONNECTOR_REDIRECT_BLOCKED",statusCode:502,details:{status:res.status}});
    if(!res.ok){
      const serverMessage=typeof (data as any)?.message==="string"?(data as any).message.trim():typeof (data as any)?.error==="string"?(data as any).error.trim():responseText.trim();
      const safeDetail=serverMessage?serverMessage.slice(0,500):"No response body was returned.";
      throw Object.assign(new Error(`PRMS token request failed (${res.status}) at ${tokenUrl}. ${safeDetail}`),{code:"PRMS_TOKEN_REQUEST_FAILED",statusCode:502,details:{status:res.status,tokenUrl,serverResponse:safeDetail}});
    }
    const accessToken=typeof (data as any).accessToken==="string"?(data as any).accessToken.trim():"";
    if(!accessToken)throw Object.assign(new Error("PRMS token response did not contain accessToken"),{code:"PRMS_TOKEN_RESPONSE_INVALID",statusCode:502,details:data});
    const jwtExpiry=decodeJwtExpiry(accessToken);
    const expiresAt=jwtExpiry&&jwtExpiry>Date.now()+30_000?jwtExpiry:Date.now()+Number(process.env.PRMS_TOKEN_CACHE_SECONDS||300)*1000;
    prmsTokenCache={token:accessToken,expiresAt};
    return accessToken;
  })();
  try{return await prmsTokenInFlight;}finally{prmsTokenInFlight=null;}
}

function prmsEndpoint(conn:any){
  const cfg=(conn.config||{}) as ConnectorConfig;
  // Endpoint belongs to the connection, not the server environment.
  // Keep the environment fallback only for old connections created before PRMS had a native endpoint field.
  const configured=String(cfg.prms?.endpoint||cfg.operations?.projectList?.path||"/api/projects").trim();
  const endpoint=configured||"/api/projects";
  if(/^https?:\/\//i.test(endpoint))throw Object.assign(new Error("PRMS API endpoint must be a relative path such as /api/portfolios"),{code:"PRMS_ENDPOINT_INVALID",statusCode:400});
  return endpoint.startsWith("/")?endpoint:`/${endpoint}`;
}

async function requestPrms(conn:any, method:string, path:string, body?:any, query?:Record<string,string>, extraHeaders?:Record<string,string>){
  const baseUrl=String(conn.baseUrl||process.env.PRMS_API_BASE_URL||"https://prmscloud.com");
  await validateOutboundUrl(baseUrl,path);
  let accessToken=await acquirePrmsAccessToken(false);
  const attempt=async(token:string)=>{
    const url=new URL(path,baseUrl.endsWith("/")?baseUrl:baseUrl+"/");
    if(query)for(const [k,v] of Object.entries(query))if(v!=null)url.searchParams.set(k,v);
    const headers:Record<string,string>={Accept:"application/json",...(extraHeaders||{}),Authorization:`Bearer ${token}`};
    if(body!==undefined)headers["Content-Type"]="application/json";
    const res=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(25_000)});
    const text=await res.text();let data:any;try{data=text?JSON.parse(text):null}catch{data=text;}
    if(res.status>=300&&res.status<400)throw Object.assign(new Error("PRMS API redirects are not allowed"),{code:"CONNECTOR_REDIRECT_BLOCKED",statusCode:502});
    return {res,data};
  };
  let result=await attempt(accessToken);
  if(result.res.status===401){
    prmsTokenCache=null;
    accessToken=await acquirePrmsAccessToken(true);
    result=await attempt(accessToken);
  }
  if(!result.res.ok){
    const status=result.res.status;
    const providerMessage=typeof result.data?.message==="string"?result.data.message:typeof result.data?.error==="string"?result.data.error:"";
    throw Object.assign(new Error(`PRMS API returned ${status}${providerMessage?`: ${providerMessage}`:""}`),{code:"PRMS_API_ERROR",statusCode:status,details:{status}});
  }
  return result.data;
}

async function requestExternal(conn:any, method:string, path:string, body?:any, query?:Record<string,string>, extraHeaders?:Record<string,string>){
  if(conn.provider==="prms") return requestPrms(conn,method,path,body,query,extraHeaders);
  await validateOutboundUrl(conn.baseUrl,path);
  await ensureOAuthAccessToken(conn);
  const secrets=decrypt<Secrets>(conn.secretCiphertext);
  const cfg=conn.config as ConnectorConfig;
  const auth=cfg.auth||{};
  const url=new URL(path,conn.baseUrl.endsWith("/")?conn.baseUrl:conn.baseUrl+"/");
  if(query)for(const [k,v] of Object.entries(query))if(v!=null)url.searchParams.set(k,v);
  const headers:Record<string,string>={Accept:"application/json",...(cfg.headers||{}),...(secrets.customHeaders||{}),...(extraHeaders||{})};
  if(body!==undefined){headers["Content-Type"]="application/json";}

  if(conn.authType==="API_KEY"){
    const name=String(auth.apiKey?.name||"X-API-Key").trim();
    const location=auth.apiKey?.location||"header";
    const prefix=String(auth.apiKey?.prefix||"").trim();
    const raw=String(secrets.apiKey||"");
    const value=prefix?`${prefix} ${raw}`:raw;
    if(location==="query") url.searchParams.set(name,value);
    else headers[name]=value;
  }
  if(conn.authType==="BEARER"){
    const header=String(auth.bearer?.header||"Authorization").trim()||"Authorization";
    const prefix=String(auth.bearer?.prefix||"Bearer").trim();
    const raw=String(secrets.bearerToken||"");
    headers[header]=prefix?`${prefix} ${raw}`:raw;
  }
  if(conn.authType?.startsWith("OAUTH2")){
    headers.Authorization=`Bearer ${secrets.accessToken||""}`;
  }
  if(conn.authType==="BASIC") headers.Authorization=`Basic ${Buffer.from(`${secrets.username||""}:${secrets.password||""}`).toString("base64")}`;
  if(conn.authType==="CUSTOM_HEADERS"){
    for(const name of auth.customQueryParamNames||[]){
      const value=secrets.customQueryParams?.[name];
      if(value!=null)url.searchParams.set(name,value);
    }
  }
  // Backward-compatible support for older custom-header credentials.
  if(secrets.customQueryParams)for(const [name,value] of Object.entries(secrets.customQueryParams))if(value!=null)url.searchParams.set(name,value);

  const res=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(25_000)});
  const text=await res.text(); let data:any; try{data=text?JSON.parse(text):null}catch{data=text;}
  if(res.status>=300&&res.status<400)throw Object.assign(new Error("External API redirects are not allowed"),{code:"CONNECTOR_REDIRECT_BLOCKED",statusCode:502});
  if(!res.ok)throw Object.assign(new Error(`External API returned ${res.status}`),{code:"CONNECTOR_EXTERNAL_ERROR",statusCode:502,details:data});
  return data;
}

async function requestOperation(conn:any,op:any,body?:any){
  const payload=body===undefined&&["POST","PUT","PATCH"].includes(String(op?.method||"GET").toUpperCase())&&op?.bodyTemplate!==undefined?op.bodyTemplate:body;
  return requestExternal(conn,op?.method||"GET",op?.path||"/",payload,op?.query,op?.headers);
}

async function requestCollection(conn:any,op:any,cfg:ConnectorConfig){
  if(!op?.path)return [];
  const pagination=cfg.pagination||{mode:"none"};
  const mode=pagination.mode||"none";
  if(mode==="none") return extractItems(await requestOperation(conn,op),cfg);
  const all:any[]=[];
  if(mode==="page"){
    const pageParam=pagination.pageParam||"page";
    const sizeParam=pagination.pageSizeParam||"pageSize";
    const pageSize=Number(pagination.pageSize||100);
    for(let page=1;page<=100;page++){
      const data=await requestExternal(conn,op.method||"GET",op.path,undefined,{...(op.query||{}),[pageParam]:String(page),[sizeParam]:String(pageSize)},op.headers);
      const items=extractItems(data,cfg); all.push(...items);
      if(items.length<pageSize)break;
    }
    return all;
  }
  let cursor:string|undefined;
  for(let i=0;i<100;i++){
    const q={...(op.query||{})};
    if(cursor)q[pagination.pageParam||"cursor"]=cursor;
    const data=await requestExternal(conn,op.method||"GET",op.path,undefined,q,op.headers);
    const items=extractItems(data,cfg); all.push(...items);
    const nextPath=pagination.nextCursorPath||pagination.cursorPath||"nextCursor";
    const next=getPath(data,nextPath);
    if(next==null||String(next)===""||String(next)===cursor)break;
    cursor=String(next);
  }
  return all;
}

function extractItems(data:any,cfg:ConnectorConfig){ const p=cfg.response?.itemsPath; const v=p?getPath(data,p):data; if(Array.isArray(v))return v; if(v&&Array.isArray(v.items))return v.items; if(v&&Array.isArray(v.data))return v.data; return v?[v]:[]; }
function externalId(item:any,cfg:ConnectorConfig){return String(getPath(item,cfg.response?.idField||"id")??"");}

async function mappingsFor(connectorId:string,entityType:EntityType,direction:string){return prisma.connectorMapping.findMany({where:{connectorId,entityType,direction:{in:[direction,"BOTH"]}}});}

async function importResources(conn:any, run:any){
  const op=(conn.config as ConnectorConfig).operations?.resourceList; if(!op?.enabled)return;
  const items=await requestCollection(conn,op,conn.config as ConnectorConfig); run.recordsRead+=items.length;
  const maps=await mappingsFor(conn.id,"resource","IMPORT");
  for(const item of items){const eid=externalId(item,conn.config as ConnectorConfig);if(!eid)continue; const values:any={};for(const m of maps)setPath(values,m.internalField,applyTransform(getPath(item,m.externalField),m.transform));
    const name=String(values.name||values.displayName||`Resource ${eid}`); const existing=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"resource",externalId:eid}}});
    const resource=existing?await prisma.resource.update({where:{id:existing.internalId},data:{name,role:values.role??undefined,capacityHoursPerDay:values.capacityHoursPerDay?Number(values.capacityHoursPerDay):undefined}}):await prisma.resource.create({data:{organizationId:conn.organizationId,name,role:values.role??undefined,capacityHoursPerDay:values.capacityHoursPerDay?Number(values.capacityHoursPerDay):8}});
    if(existing)run.recordsUpdated++;else run.recordsCreated++; await upsertConnectorIdentity(conn.id,"resource",eid,resource.id);
  }
}

async function importProjectsAndTasks(conn:any,run:any){
  const cfg=conn.config as ConnectorConfig; const pOp=cfg.operations?.projectList; const tOp=cfg.operations?.taskList; const entities=cfg.sync?.entities||["task"];
  if(entities.includes("project")&&pOp?.enabled){
    const items=await requestCollection(conn,pOp,cfg); run.recordsRead+=items.length; const maps=await mappingsFor(conn.id,"project","IMPORT");
    for(const item of items){const eid=externalId(item,cfg);if(!eid)continue;const v:any={};for(const m of maps)setPath(v,m.internalField,applyTransform(getPath(item,m.externalField),m.transform));const name=String(v.name||`Project ${eid}`);const start=new Date(v.startDate||Date.now());const existing=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"project",externalId:eid}}});const project=existing?await prisma.project.update({where:{id:existing.internalId},data:{name,description:v.description??undefined,startDate:Number.isNaN(start.getTime())?new Date():start}}):await prisma.project.create({data:{organizationId:conn.organizationId,name,description:v.description??undefined,startDate:Number.isNaN(start.getTime())?new Date():start}});if(existing)run.recordsUpdated++;else run.recordsCreated++;await upsertConnectorIdentity(conn.id,"project",eid,project.id);
    }
  }
  if(entities.includes("task")&&tOp?.enabled){
    const target=cfg.targetProjectId; if(!target)throw Object.assign(new Error("A target project is required for task synchronization"),{code:"CONNECTOR_TARGET_PROJECT_REQUIRED",statusCode:400});
    const path=tOp.path.replace("{projectId}",encodeURIComponent(target)); const items=await requestCollection(conn,{...tOp,path},cfg);run.recordsRead+=items.length;const maps=await mappingsFor(conn.id,"task","IMPORT");
    const pendingParents:Array<{taskId:string;parentExternalId:string}>=[];
    for(const item of items){
      const eid=externalId(item,cfg);if(!eid)continue;const v:any={};for(const m of maps)setPath(v,m.internalField,applyTransform(getPath(item,m.externalField),m.transform));
      const start=new Date(v.expectedStart),end=new Date(v.expectedEnd);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())){run.recordsFailed++;continue;}
      const existing=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"task",externalId:eid}}});
      const data:any={projectId:target,name:String(v.name||`Task ${eid}`),expectedStart:start,expectedEnd:end,durationDays:Math.max(1,Math.round((end.getTime()-start.getTime())/86400000)),description:v.description??undefined,progressPct:v.progressPct==null?0:Number(v.progressPct),status:v.status||"ACTIVE",isManualSchedule:false};
      const task=existing?await prisma.task.update({where:{id:existing.internalId},data}):await prisma.task.create({data});
      if(existing)run.recordsUpdated++;else run.recordsCreated++;
      await upsertConnectorIdentity(conn.id,"task",eid,task.id);
      const parentExternalId=String(v.parentExternalId??v.parent_external_id??v.parentIdExternal??v.parentId??"").trim();
      if(parentExternalId && parentExternalId!==eid) pendingParents.push({taskId:task.id,parentExternalId});
      if(v.resourceExternalId){const rid=String(v.resourceExternalId);const identity=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"resource",externalId:rid}}});if(identity){await prisma.assignment.upsert({where:{taskId_resourceId:{taskId:task.id,resourceId:identity.internalId}},create:{taskId:task.id,resourceId:identity.internalId,allocationPct:100},update:{}});}}
    }
    for(const p of pendingParents){const parentIdentity=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"task",externalId:p.parentExternalId}}});if(parentIdentity && parentIdentity.internalId!==p.taskId)await prisma.task.update({where:{id:p.taskId},data:{parentId:parentIdentity.internalId}});else if(!parentIdentity){const direct=await prisma.task.findFirst({where:{id:p.parentExternalId,projectId:target}});if(direct && direct.id!==p.taskId)await prisma.task.update({where:{id:p.taskId},data:{parentId:direct.id}});}}
  }
}

async function importGoogleSheetTasks(conn:any,run:any){
  const cfg=conn.config as ConnectorConfig & {google?:{spreadsheetId?:string;sheetTitle?:string;range?:string;headerRow?:number}};
  const g=cfg.google||{};if(!g.spreadsheetId||!g.sheetTitle)throw Object.assign(new Error("Select a Google spreadsheet and worksheet before syncing"),{code:"GOOGLE_SHEET_NOT_SELECTED",statusCode:400});
  const target=cfg.targetProjectId;if(!target)throw Object.assign(new Error("A target SI project is required for Google Sheets task synchronization"),{code:"CONNECTOR_TARGET_PROJECT_REQUIRED",statusCode:400});
  const range=g.range||`${g.sheetTitle}!A1:Z5000`;const data=await googlePreviewValues(conn.id,conn.organizationId,g.spreadsheetId,range);const rows=(data as any).values||[];const headerIndex=Math.max(0,Number(g.headerRow||1)-1);const headers=(rows[headerIndex]||[]).map((x:any)=>String(x??""));if(!headers.length)throw Object.assign(new Error("The selected Google Sheet does not contain a usable header row"),{code:"GOOGLE_SHEET_HEADERS_MISSING",statusCode:400});
  const maps=await mappingsFor(conn.id,"task","IMPORT");const byExternal=new Map<string,number>();headers.forEach((h:string,i:number)=>byExternal.set(h,i));
  for(const row of rows.slice(headerIndex+1)){if(!row||row.every((v:any)=>String(v??"").trim()===""))continue;run.recordsRead++;const item:any={};for(const m of maps){const i=byExternal.get(m.externalField);if(i!==undefined)item[m.internalField]=applyTransform(row[i],m.transform);}
    const eid=String(item.externalId||"").trim();if(!eid){run.recordsFailed++;continue;}const name=String(item.name||`Task ${eid}`).trim();const start=new Date(String(item.expectedStart||""));const end=new Date(String(item.expectedEnd||""));if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())){run.recordsFailed++;continue;}
    const statusRaw=String(item.status||"ACTIVE").toUpperCase();const status=(['ACTIVE','ON_HOLD','CLOSED','DELAYED'].includes(statusRaw)?statusRaw:'ACTIVE') as any;const progress=Math.max(0,Math.min(100,Number(item.progressPct||0)||0));const data:any={projectId:target,name,expectedStart:start,expectedEnd:end,durationDays:Math.max(1,Math.round((end.getTime()-start.getTime())/86400000)),description:item.description==null?undefined:String(item.description),progressPct:progress,status,isManualSchedule:false};
    const existing=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"task",externalId:eid}}});const task=existing?await prisma.task.update({where:{id:existing.internalId},data}):await prisma.task.create({data});if(existing)run.recordsUpdated++;else run.recordsCreated++;await upsertConnectorIdentity(conn.id,"task",eid,task.id);
    if(item.resourceExternalId){const rid=String(item.resourceExternalId);const identity=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"resource",externalId:rid}}});if(identity){await prisma.assignment.upsert({where:{taskId_resourceId:{taskId:task.id,resourceId:identity.internalId}},create:{taskId:task.id,resourceId:identity.internalId,allocationPct:100},update:{}});}}
  }
}

const activeConnectorSyncs=new Set<string>();

async function importPrmsSchedule(conn:any,run:any){
  const projectId=prmsProjectId(conn);
  const schedule=await getPrmsSchedule(conn.id,conn.organizationId);
  run.recordsRead+=schedule.taskCount;
  const externalProjectId=`PRMS:${projectId}`;
  const projectIdentity=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"project",externalId:externalProjectId}}});
  const validTasks=schedule.tasks.filter((t:any)=>t.expectedStart&&t.expectedEnd);
  const minStart=validTasks.reduce((min:number,t:any)=>Math.min(min,new Date(t.expectedStart).getTime()),Number.POSITIVE_INFINITY);
  const startDate=Number.isFinite(minStart)?new Date(minStart):new Date();
  const project=projectIdentity
    ? await prisma.project.update({where:{id:projectIdentity.internalId},data:{name:`PRMS · Project ${projectId}`,startDate}})
    : await prisma.project.create({data:{organizationId:conn.organizationId,name:`PRMS · Project ${projectId}`,description:`Synchronized from PRMS project ${projectId}`,startDate}});
  await upsertConnectorIdentity(conn.id,"project",externalProjectId,project.id);

  const internalByExternal=new Map<string,string>();
  for(const source of schedule.tasks){
    const existing=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"task",externalId:source.id}}});
    if(!source.expectedStart||!source.expectedEnd){run.recordsFailed++;continue;}
    const data:any={projectId:project.id,name:String(source.name||`${source.sourceType} ${source.sourceId}`),expectedStart:new Date(source.expectedStart),expectedEnd:new Date(source.expectedEnd),durationDays:Math.max(1,Math.round((new Date(source.expectedEnd).getTime()-new Date(source.expectedStart).getTime())/DAY)),actualStart:source.actualStart?new Date(source.actualStart):null,actualEnd:source.actualEnd?new Date(source.actualEnd):null,targetDate:source.targetDate?new Date(source.targetDate):null,status:source.status||"ACTIVE",taskType:source.taskType||"TASK",sortOrder:Number(source.sortOrder||0),isManualSchedule:false};
    const task=existing?await prisma.task.update({where:{id:existing.internalId},data}):await prisma.task.create({data});
    internalByExternal.set(source.id,task.id);
    if(existing)run.recordsUpdated++;else run.recordsCreated++;
    await upsertConnectorIdentity(conn.id,"task",source.id,task.id);
    if(source.resourceExternalId){
      const resourceKey=`MEMBER:${source.resourceExternalId}`;
      const resourceIdentity=await prisma.connectorIdentity.findUnique({where:{connectorId_entityType_externalId:{connectorId:conn.id,entityType:"resource",externalId:resourceKey}}});
      let resource:any=null;
      if(resourceIdentity) resource=await prisma.resource.findFirst({where:{id:resourceIdentity.internalId,organizationId:conn.organizationId}});
      if(!resource && source.resourceName) resource=await prisma.resource.findFirst({where:{organizationId:conn.organizationId,name:source.resourceName}});
      if(!resource) resource=await prisma.resource.create({data:{organizationId:conn.organizationId,name:source.resourceName||`Member ${source.resourceExternalId}`,role:source.resourceRole,capacityHoursPerDay:8}});
      else if(source.resourceName && resource.name!==source.resourceName && resourceIdentity) await prisma.resource.update({where:{id:resource.id},data:{name:source.resourceName}});
      await upsertConnectorIdentity(conn.id,"resource",resourceKey,resource.id);
      await prisma.assignment.upsert({where:{taskId_resourceId:{taskId:task.id,resourceId:resource.id}},create:{taskId:task.id,resourceId:resource.id,allocationPct:100,role:source.resourceRole},update:{role:source.resourceRole}});
    }
  }
  for(const source of schedule.tasks){
    const taskId=internalByExternal.get(source.id); const parentId=source.parentId?internalByExternal.get(source.parentId):undefined;
    if(taskId)await prisma.task.update({where:{id:taskId},data:{parentId:parentId||null}});
  }
  const currentExternal=new Set(schedule.tasks.filter((t:any)=>t.expectedStart&&t.expectedEnd).map((t:any)=>t.id));
  const owned=await prisma.connectorIdentity.findMany({where:{connectorId:conn.id,entityType:"task"}});
  for(const identity of owned){
    if(!currentExternal.has(identity.externalId)){
      const task=await prisma.task.findFirst({where:{id:identity.internalId,projectId:project.id}});
      if(task){await prisma.task.delete({where:{id:task.id}});run.recordsUpdated++;}
      await prisma.connectorIdentity.delete({where:{id:identity.id}});
    }
  }
  // Parent dates are summary values derived from the complete merged Events + Actions hierarchy.
  await recomputeProjectSchedule(prisma, project.id);
  run.details={...(run.details||{}),projectId,internalProjectId:project.id,prmsTaskCount:schedule.taskCount};
  return project;
}

export async function syncConnector(connectorId:string, organizationId:string){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  if(activeConnectorSyncs.has(connectorId))throw Object.assign(new Error("A synchronization is already running for this connection."),{code:"CONNECTOR_SYNC_IN_PROGRESS",statusCode:409});
  activeConnectorSyncs.add(connectorId);
  const run=await prisma.connectorSyncRun.create({data:{connectorId,direction:conn.direction,status:"RUNNING"}});const mutable:any={recordsRead:0,recordsCreated:0,recordsUpdated:0,recordsFailed:0,details:{}};
  try{
    if(conn.direction!=="EXPORT"){
      if(conn.provider==="prms") await importPrmsSchedule(conn,mutable);
      else if(conn.provider==="google-sheets")await importGoogleSheetTasks(conn,mutable);
      else{await importResources(conn,mutable);await importProjectsAndTasks(conn,mutable);}
    }
    await prisma.connectorSyncRun.update({where:{id:run.id},data:{...mutable,status:"SUCCEEDED",completedAt:new Date()}});
    await prisma.connector.update({where:{id:conn.id},data:{lastSyncAt:new Date(),lastError:null,status:"CONNECTED"}});
    return {...mutable,id:run.id,status:"SUCCEEDED"};
  }catch(e:any){
    await prisma.connectorSyncRun.update({where:{id:run.id},data:{...mutable,status:"FAILED",completedAt:new Date(),error:String(e?.message||e),details:e?.details||{}}});
    await prisma.connector.update({where:{id:conn.id},data:{lastError:String(e?.message||e),status:"ERROR"}});throw e;
  }finally{activeConnectorSyncs.delete(connectorId);}
}
export function prmsConfigurationStatus(){
  const values={tokenUrl:Boolean(String(process.env.PRMS_TOKEN_URL||"").trim()),clientId:Boolean(String(process.env.PRMS_CLIENT_ID||"").trim()),clientSecret:Boolean(String(process.env.PRMS_CLIENT_SECRET||"").trim()),bootstrapBearer:Boolean(String(process.env.PRMS_BEARER_TOKEN||"").trim()),baseUrl:String(process.env.PRMS_API_BASE_URL||"https://prmscloud.com").trim()};
  return {configured:values.tokenUrl&&values.clientId&&values.clientSecret&&values.bootstrapBearer,baseUrl:values.baseUrl,tokenUrl:String(process.env.PRMS_TOKEN_URL||"https://prmscloud.com/api/account/token").trim(),missing:Object.entries(values).filter(([k,v])=>k!=="baseUrl"&&!v).map(([k])=>k)};
}

function prmsProjectId(conn:any){
  const id=String((conn.config as any)?.prms?.projectId||"").trim();
  if(!id)throw Object.assign(new Error("PRMS Project ID is not configured"),{code:"PRMS_PROJECT_ID_REQUIRED",statusCode:400});
  if(!/^[A-Za-z0-9_-]+$/.test(id))throw Object.assign(new Error("PRMS Project ID contains unsupported characters"),{code:"PRMS_PROJECT_ID_INVALID",statusCode:400});
  return id;
}
function pickValue(obj:any,names:string[],fallback:any=null){if(!obj||typeof obj!=="object")return fallback;const keys=Object.keys(obj);for(const n of names){const k=keys.find(x=>x.toLowerCase()===n.toLowerCase());if(k!==undefined&&obj[k]!==undefined&&obj[k]!==null)return obj[k];}return fallback;}
function toIso(value:any){if(value===null||value===undefined||value==="")return null;const d=new Date(value);if(Number.isNaN(d.getTime())||d.getUTCFullYear()<1901)return null;return d.toISOString();}
function prmsTaskFrom(raw:any,type:"event"|"action"){
  const id=String(pickValue(raw,type==="event"?["E_ID","id","ID"]:["ID_Action","id","ID"],""));if(!id)return null;
  const name=String(pickValue(raw,type==="event"?["E_Name","name","Description"]:["Description","name","Name"],`${type} ${id}`));
  const description=String(pickValue(raw,type==="event"?["E_Description","Description","E_SOW","E_Comments"]:["Instructions","Comment","Notes"],"")).trim()||null;
  // Keep the PRMS → Gantt behavior aligned with the established PRMS C# flow:
  // actual dates come from PRMS, while missing actual end is treated as ongoing;
  // expected dates fall back to actual start and a seven-day window.
  const actualStart=toIso(pickValue(raw,type==="event"?["E_StartDate","startDate","StartDate"]:["Start_Date","startDate","StartDate"]));
  const rawActualEnd=toIso(pickValue(raw,type==="event"?["E_FinishDate","finishDate","EndDate"]:["End_Date","endDate","EndDate"]));
  const actualEnd=rawActualEnd||new Date().toISOString();
  const expectedStart=toIso(pickValue(raw,type==="event"?["E_StartExpectedDay","expectedStart","ExpectedStartDay"]:["ExpectedStartDay","expectedStart","StartExpectedDay"],actualStart));
  const rawExpectedEnd=toIso(pickValue(raw,type==="event"?["E_EndExpectedDay","expectedEnd","ExpectedEndDay"]:["ExpectedEndDay","expectedEnd","EndExpectedDay"],null));
  const expectedEnd=rawExpectedEnd||(expectedStart?toIso(new Date(new Date(expectedStart).getTime()+7*DAY)):actualStart?toIso(new Date(new Date(actualStart).getTime()+7*DAY)):null);
  // ParentKey/E_ID_Dependance is hierarchy only. It must become parentId,
  // never a predecessor/dependency. Actions are children of their PRMS Event.
  const parentRaw=type==="event"?pickValue(raw,["E_ID_Dependance","ParentKey","parentId","ParentId"],0):pickValue(raw,["E_Id","ParentKey","eventId","E_ID","ParentEventId"],0);
  const status=String(pickValue(raw,["Status","status"],"ACTIVE")).toUpperCase();const taskTypeRaw=String(pickValue(raw,["TaskType","taskType","Type"],"TASK")).toUpperCase();const taskType=(taskTypeRaw.includes("MILESTONE")?"MILESTONE":type==="event"&&taskTypeRaw.includes("SUMMARY")?"SUMMARY":"TASK");
  const start=expectedStart||actualStart;const end=expectedEnd||start;const parentId=parentRaw&&String(parentRaw)!=="0"?`E${String(parentRaw)}`:null;
  const resourceExternalRaw=type==="event"?String(pickValue(raw,["E_Leader","LeaderId","leaderId","ID_Member"],"")).trim():String(pickValue(raw,["ID_Member","MemberId","memberId"],"")).trim();
  const resourceExternalId=resourceExternalRaw && resourceExternalRaw!=="0" ? resourceExternalRaw : "";
  const resourceName=type==="event"?String(pickValue(raw,["Initial_Member","Member_Name","memberName"],"")).trim():String(pickValue(raw,["AssignedTo","Initial_Member","Member_Name","memberName"],"")).trim();
  const resourceRole=type==="event"?"LEAD":"ASSIGNEE";
  const targetDate=type==="action"?toIso(pickValue(raw,["DueDate","dueDate","TargetDate"],null)):null;
  return {id:`${type==="event"?"E":"A"}${id}`,sourceId:id,sourceType:type,name,description,expectedStart:start,expectedEnd:end,actualStart,actualEnd,parentId,taskType,status:["ACTIVE","ON_HOLD","CLOSED","DELAYED"].includes(status)?status:"ACTIVE",targetDate,resourceExternalId,resourceName,resourceRole};
}

export async function getPrmsSchedule(connectorId:string,organizationId:string){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}}); if(!conn) throw Object.assign(new Error("Connector not found"),{statusCode:404});
  if(conn.provider!=="prms") throw Object.assign(new Error("This connection is not a PRMS connector"),{code:"PRMS_PROVIDER_REQUIRED",statusCode:400});
  try{
    const projectId=prmsProjectId(conn);
    const [eventsRaw,actionsRaw]=await Promise.all([
      requestPrms(conn,"GET",`/api/prms/EventsHierarchy/${encodeURIComponent(projectId)}`),
      requestPrms(conn,"GET",`/api/taskaction/ActionHierarchybyProject/${encodeURIComponent(projectId)}`)
    ]);
    const events=Array.isArray(eventsRaw)?eventsRaw:(Array.isArray(eventsRaw?.data)?eventsRaw.data:Array.isArray(eventsRaw?.items)?eventsRaw.items:[]);
    const actions=Array.isArray(actionsRaw)?actionsRaw:(Array.isArray(actionsRaw?.data)?actionsRaw.data:Array.isArray(actionsRaw?.items)?actionsRaw.items:[]);
    const tasks=[...events.map((x:any,i:number)=>{const t=prmsTaskFrom(x,"event");return t?{...t,sortOrder:i}:null}),...actions.map((x:any,i:number)=>{const t=prmsTaskFrom(x,"action");return t?{...t,sortOrder:100000+i}:null})].filter(Boolean);
    return {provider:"prms",projectId,taskCount:tasks.length,eventCount:events.length,actionCount:actions.length,tasks,dependencies:[]};
  }catch(e:any){ await prisma.connector.update({where:{id:conn.id},data:{status:"ERROR",lastError:String(e?.message||"PRMS schedule load failed"),lastTestedAt:new Date()}}).catch(()=>undefined); throw e; }
}

export async function updatePrmsExpectedDates(connectorId:string,organizationId:string,body:any){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}}); if(!conn) throw Object.assign(new Error("Connector not found"),{statusCode:404});
  if(conn.provider!=="prms") throw Object.assign(new Error("This connection is not a PRMS connector"),{code:"PRMS_PROVIDER_REQUIRED",statusCode:400});
  const id=String(body?.id||"").trim(); const isAction=Boolean(body?.isAction); const start=toIso(body?.startDate); const end=toIso(body?.endDate);
  if(!/^\d+$/.test(id)) throw Object.assign(new Error("A numeric PRMS entity ID is required"),{code:"PRMS_ENTITY_ID_INVALID",statusCode:400});
  if(!start||!end) throw Object.assign(new Error("Valid expected startDate and endDate are required"),{code:"PRMS_DATES_INVALID",statusCode:400});
  try{
    const result=await requestPrms(conn,"PUT","/api/prms/UpdateExpectedDates",{Id:Number(id),IsAction:isAction,StartDate:start,EndDate:end});
    await prisma.connector.update({where:{id:conn.id},data:{status:"CONNECTED",lastError:null,lastTestedAt:new Date()}});
    return result;
  }catch(e:any){await prisma.connector.update({where:{id:conn.id},data:{status:"ERROR",lastError:String(e?.message||"PRMS expected date update failed")}}).catch(()=>undefined);throw e;}
}

export async function testConnector(connectorId:string,organizationId:string){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});
  if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  try{
    let data:any;
    if(conn.provider==="google-sheets"){
      const g=(conn.config as any).google||{};
      if(!g.spreadsheetId||!g.sheetTitle)throw Object.assign(new Error("Select a Google spreadsheet and worksheet before testing"),{code:"GOOGLE_SHEET_NOT_SELECTED",statusCode:400});
      data=await googlePreviewValues(conn.id,conn.organizationId,g.spreadsheetId,g.range||`${g.sheetTitle}!A1:Z10`);
    }else if(conn.provider==="prms"){
      data=await getPrmsSchedule(conn.id,conn.organizationId);
    }else{
      const cfg=conn.config as ConnectorConfig;const op=cfg.operations?.projectList||cfg.operations?.taskList||cfg.operations?.resourceList;
      data=op?.path?await requestOperation(conn,op):await requestExternal(conn,"GET","/");
    }
    await prisma.connector.update({where:{id:conn.id},data:{lastTestedAt:new Date(),status:"CONNECTED",lastError:null}});
    return {ok:true,status:"CONNECTED",sample:Array.isArray(data)?data.slice(0,3):data};
  }catch(e:any){
    await prisma.connector.update({where:{id:conn.id},data:{lastTestedAt:new Date(),status:"ERROR",lastError:String(e?.message||"Connector test failed")}});
    throw e;
  }
}

export async function pushTaskUpdate(taskId:string,organizationId:string){
  const task=await prisma.task.findFirst({where:{id:taskId,project:{organizationId}}});if(!task)return;
  const connectors=await prisma.connector.findMany({where:{organizationId,status:"CONNECTED",OR:[{provider:"prms"},{direction:{in:["EXPORT","BIDIRECTIONAL"]}}]}});
  for(const conn of connectors){
    try{
      const cfg=conn.config as ConnectorConfig & {google?:{spreadsheetId?:string;sheetTitle?:string;range?:string;headerRow?:number}};
      if(conn.provider==="prms"){
        const identity=await prisma.connectorIdentity.findFirst({where:{connectorId:conn.id,entityType:"task",internalId:task.id}});
        if(identity){
          const external=String(identity.externalId);
          if(external.startsWith("E")||external.startsWith("A")){
            await updatePrmsExpectedDates(conn.id,conn.organizationId,{id:external.slice(1),isAction:external.startsWith("A"),startDate:task.expectedStart.toISOString(),endDate:task.expectedEnd.toISOString()});
          }
        }
        continue;
      }
      if(conn.provider==="google-sheets"){
        const g=cfg.google||{};if(!g.spreadsheetId||!g.sheetTitle)continue;const maps=await mappingsFor(conn.id,"task","EXPORT");if(!maps.length)continue;
        const range=g.range||`${g.sheetTitle}!A1:Z5000`;const data=await googlePreviewValues(conn.id,conn.organizationId,g.spreadsheetId,range);const rows=(data as any).values||[];const headerIndex=Math.max(0,Number(g.headerRow||1)-1);const headers=(rows[headerIndex]||[]).map((x:any)=>String(x??""));const idMap=maps.find(m=>m.internalField==="externalId");if(!idMap)continue;const idColumn=headers.indexOf(idMap.externalField);if(idColumn<0)continue;
        const identity=await prisma.connectorIdentity.findFirst({where:{connectorId:conn.id,entityType:"task",internalId:task.id}});if(!identity)continue;const rowIndex=rows.findIndex((r:any[],i:number)=>i>headerIndex&&String(r?.[idColumn]??"")===identity.externalId);if(rowIndex<0)continue;
        for(const m of maps){const col=headers.indexOf(m.externalField);if(col<0)continue;const value=applyTransform(getPath(task,m.internalField),m.transform);const a1Column=columnLetters(col+1);const targetRange=`${quoteSheetTitle(g.sheetTitle)}!${a1Column}${rowIndex+1}`;const u=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(g.spreadsheetId)}/values/${encodeURIComponent(targetRange)}?valueInputOption=USER_ENTERED`;await googleRequest(conn,u,{method:"PUT",body:JSON.stringify({range:targetRange,majorDimension:"ROWS",values:[[value??""]]})});
        }
        continue;
      }
      const cfg2=conn.config as ConnectorConfig;const op=cfg2.operations?.taskUpdate;if(!op?.enabled)continue;const identity=await prisma.connectorIdentity.findFirst({where:{connectorId:conn.id,entityType:"task",internalId:task.id}});if(!identity)continue;const maps=await mappingsFor(conn.id,"task","EXPORT");const payload:any={};for(const m of maps){const value=getPath(task,m.internalField);setPath(payload,m.externalField,applyTransform(value,m.transform));}const path=op.path.replace("{id}",encodeURIComponent(identity.externalId));await requestExternal(conn,op.method||"PATCH",path,payload,op.query,op.headers);
    }catch(e){
      await prisma.connector.update({where:{id:conn.id},data:{lastError:(e as Error).message,status:"ERROR"}});
      if(conn.provider==="prms") throw e;
    }
  }
}
function quoteSheetTitle(title:string){return `'${String(title).replace(/'/g,"''")}'`;}
function columnLetters(n:number){let s="";while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}

export async function authorizeOAuth(connectorId:string,organizationId:string){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  const cfg=conn.config as ConnectorConfig;const oauth=cfg.oauth||{};
  if(!oauth.authorizeUrl||!oauth.clientId||!oauth.redirectUri)throw Object.assign(new Error("OAuth setup is incomplete. Save the client ID and exact redirect URI before connecting the account."),{code:"OAUTH_CONFIGURATION_INCOMPLETE",statusCode:400});
  await validateAbsoluteExternalUrl(oauth.authorizeUrl);await validateAbsoluteExternalUrl(oauth.redirectUri);
  const raw=randomBytes(32).toString("base64url");await prisma.connectorOAuthState.create({data:{connectorId,stateHash:hashToken(raw),expiresAt:new Date(Date.now()+10*60_000)}});
  const u=new URL(oauth.authorizeUrl);u.searchParams.set("response_type","code");u.searchParams.set("client_id",oauth.clientId);u.searchParams.set("redirect_uri",oauth.redirectUri);u.searchParams.set("state",raw);if(oauth.scopes)u.searchParams.set("scope",oauth.scopes);if(oauth.audience)u.searchParams.set("audience",oauth.audience);if(conn.provider==="google-sheets"){u.searchParams.set("access_type","offline");u.searchParams.set("prompt","consent");u.searchParams.set("include_granted_scopes","true");}return {url:u.toString()};
}
export async function oauthCallback(code:string,state:string){
  const row=await prisma.connectorOAuthState.findUnique({where:{stateHash:hashToken(state)},include:{connector:true}});
  if(!row||row.expiresAt<new Date())throw Object.assign(new Error("OAuth state is invalid or expired. Start the connection again."),{code:"OAUTH_STATE_INVALID",statusCode:400});
  const conn=row.connector;
  try{
    const cfg=conn.config as ConnectorConfig;const oauth=cfg.oauth||{};const sec=decrypt<Secrets>(conn.secretCiphertext);
    if(!oauth.tokenUrl||!oauth.clientId||!sec.clientSecret||!oauth.redirectUri)throw Object.assign(new Error("OAuth token configuration is incomplete"),{code:"OAUTH_CONFIGURATION_INCOMPLETE",statusCode:400});
    await validateAbsoluteExternalUrl(oauth.tokenUrl);
    const form=new URLSearchParams({grant_type:"authorization_code",code,client_id:oauth.clientId,client_secret:sec.clientSecret,redirect_uri:oauth.redirectUri});
    const res=await fetch(oauth.tokenUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:form,redirect:"manual",signal:AbortSignal.timeout(20_000)});
    const data: Record<string,unknown>=await readJsonObject(res);
    if(res.status>=300&&res.status<400)throw Object.assign(new Error("OAuth token endpoint redirects are not allowed"),{code:"CONNECTOR_REDIRECT_BLOCKED",statusCode:502});
    if(!res.ok||typeof data.access_token!=="string"||!data.access_token){
      const providerMessage=String((data as any)?.error_description||(data as any)?.error||`OAuth token exchange returned ${res.status}`);
      throw Object.assign(new Error(providerMessage),{code:"OAUTH_TOKEN_EXCHANGE_FAILED",statusCode:res.status===400?400:502,details:data});
    }
    const expiresIn=typeof data.expires_in==="number"?data.expires_in:3600;
    await prisma.connector.update({where:{id:conn.id},data:{secretCiphertext:encrypt({...sec,accessToken:data.access_token as string,accessTokenExpiresAt:Date.now()+expiresIn*1000,refreshToken:typeof data.refresh_token==="string"?data.refresh_token:sec.refreshToken}),status:"CONNECTED",lastTestedAt:new Date(),lastError:null}});
    await prisma.connectorOAuthState.delete({where:{id:row.id}});
    return {ok:true,connectorId:conn.id};
  }catch(e:any){
    await prisma.connector.update({where:{id:conn.id},data:{status:"ERROR",lastError:String(e?.message||"OAuth authorization failed")}}).catch(()=>undefined);
    throw e;
  }
}
export async function testWriteOperation(connectorId:string,organizationId:string,operationKey:string,body:any){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});const cfg=conn.config as ConnectorConfig;let op=cfg.operations?.[operationKey];if(!op||!op.enabled||!["POST","PUT","PATCH","DELETE"].includes(op.method))throw Object.assign(new Error("Write operation is not configured and enabled"),{code:"CONNECTOR_WRITE_OPERATION_MISSING",statusCode:400});
  if(op.path.includes("{id}")){const id=String(body?.__testExternalId||"");if(!id)throw Object.assign(new Error("Provide __testExternalId for an endpoint containing {id}"),{statusCode:400});op={...op,path:op.path.replace("{id}",encodeURIComponent(id))};}
  const payload={...body};delete payload.__testExternalId;return {ok:true,method:op.method,path:op.path,response:await requestExternal(conn,op.method,op.path,payload,op.query,op.headers)};
}
export async function createConnector(input:any,organizationId:string){
  const {secrets,...rest}=input;
  if(rest.provider==="prms"){
    const cfg:any=rest.config||{}; const prms:any=cfg.prms||{};
    const projectId=String(prms.projectId||"").trim();
    if(!projectId) throw Object.assign(new Error("PRMS Project ID is required"),{code:"PRMS_PROJECT_ID_REQUIRED",statusCode:400});
    rest.baseUrl=String(rest.baseUrl||process.env.PRMS_API_BASE_URL||"https://prmscloud.com").trim(); rest.authType="NONE";
    rest.config={...cfg,prms:{projectId}};
  }
  if(rest.provider==="google-sheets"){
    const cfg:any=rest.config||{};
    const oauth:any=cfg.oauth||{};
    const envClientId=String(process.env.GOOGLE_OAUTH_CLIENT_ID||"").trim();
    const envClientSecret=String(process.env.GOOGLE_OAUTH_CLIENT_SECRET||"").trim();
    if(envClientId && !oauth.clientId) oauth.clientId=envClientId;
    if(!oauth.authorizeUrl) oauth.authorizeUrl="https://accounts.google.com/o/oauth2/v2/auth";
    if(!oauth.tokenUrl) oauth.tokenUrl="https://oauth2.googleapis.com/token";
    if(!oauth.scopes) oauth.scopes="https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly";
    rest.config={...cfg,oauth};
    if(envClientSecret && !secrets?.clientSecret) input.secrets={...(secrets||{}),clientSecret:envClientSecret};
  }
  return prisma.connector.create({data:{...rest,organizationId,secretCiphertext:input.secrets?encrypt(input.secrets):null}});
}
export async function updateConnector(id:string,organizationId:string,input:any){
  const {secrets,...rest}=input;const existing=await prisma.connector.findFirst({where:{id,organizationId}});if(!existing)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  if(existing.provider==="prms" || rest.provider==="prms"){
    const cfg:any={...(existing.config as any||{}),...(rest.config||{})}; const prms:any=cfg.prms||{};
    const projectId=String(prms.projectId||"").trim();
    if(!projectId) throw Object.assign(new Error("PRMS Project ID is required"),{code:"PRMS_PROJECT_ID_REQUIRED",statusCode:400});
    rest.provider="prms"; rest.baseUrl=String(rest.baseUrl||existing.baseUrl||process.env.PRMS_API_BASE_URL||"https://prmscloud.com").trim(); rest.authType="NONE";
    rest.config={...cfg,prms:{projectId}};
  }
  return prisma.connector.update({where:{id},data:{...rest,...(secrets?{secretCiphertext:encrypt(secrets)}:{})}});
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



function operationKeyFromPath(method:string,path:string){
  const slug=path.replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,70)||"root";
  return `${method.toLowerCase()}_${slug}`;
}

function inferOperationGroup(path:string){
  const p=path.toLowerCase();
  if(p.includes("task")) return "taskList";
  if(p.includes("resource")||p.includes("member")||p.includes("user")) return "resourceList";
  if(p.includes("project")) return "projectList";
  return null;
}

function normalizeOpenApiOperations(spec:any){
  const operations:Record<string,{method:string;path:string;enabled:boolean;summary?:string;source?:string}>={};
  const paths=spec?.paths&&typeof spec.paths==="object"?spec.paths:{};
  for(const [path,item] of Object.entries<any>(paths)){
    if(!path.startsWith("/"))continue;
    for(const method of ["get","post","put","patch","delete"]){
      const op=item?.[method];
      if(!op||typeof op!=="object")continue;
      const key=operationKeyFromPath(method.toUpperCase(),path);
      operations[key]={method:method.toUpperCase(),path,enabled:method==="get",summary:String(op.summary||op.operationId||`${method.toUpperCase()} ${path}`),source:String(op.operationId||"")};
      const group=inferOperationGroup(path);
      if(group && method==="get" && !operations[group]) operations[group]={method:"GET",path,enabled:true,summary:String(op.summary||`${group} discovery`),source:String(op.operationId||"")};
      if(group && ["post","put","patch","delete"].includes(method)){
        const suffix=method==="post"?"Create":method==="delete"?"Delete":"Update";
        const writeKey=group.replace("List",suffix);
        if(!operations[writeKey]) operations[writeKey]={method:method.toUpperCase(),path,enabled:false,summary:String(op.summary||`${method.toUpperCase()} ${path}`),source:String(op.operationId||"")};
      }
    }
  }
  return operations;
}

export async function importOpenApiContract(connectorId:string,organizationId:string,input:{specUrl?:string;spec?:unknown}){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});
  if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  let spec:any=input.spec;
  if(input.specUrl){
    await validateAbsoluteExternalUrl(input.specUrl);
    const res=await fetch(input.specUrl,{headers:{Accept:"application/json"},redirect:"manual",signal:AbortSignal.timeout(20_000)});
    if(res.status>=300&&res.status<400)throw Object.assign(new Error("OpenAPI document redirects are not allowed"),{code:"CONNECTOR_REDIRECT_BLOCKED",statusCode:502});
    if(!res.ok)throw Object.assign(new Error(`OpenAPI document returned ${res.status}`),{code:"OPENAPI_FETCH_FAILED",statusCode:502});
    const text=await res.text();
    try{spec=JSON.parse(text);}catch{throw Object.assign(new Error("Only JSON OpenAPI documents are supported in this release. Export the OpenAPI/Swagger document as JSON and try again."),{code:"OPENAPI_JSON_REQUIRED",statusCode:400});}
  }
  if(!spec||typeof spec!=="object")throw Object.assign(new Error("Provide a valid OpenAPI/Swagger JSON document"),{code:"OPENAPI_INVALID",statusCode:400});
  const version=String(spec.openapi||spec.swagger||"");
  if(!version)throw Object.assign(new Error("The document does not look like OpenAPI or Swagger JSON"),{code:"OPENAPI_INVALID",statusCode:400});
  const servers=Array.isArray(spec.servers)?spec.servers:[];
  const serverUrl=servers[0]?.url || (spec.host?`${spec.schemes?.[0]||"https"}://${spec.host}${spec.basePath||""}`:"");
  const baseUrl=serverUrl||conn.baseUrl;
  if(serverUrl)await validateAbsoluteExternalUrl(serverUrl);
  const imported=normalizeOpenApiOperations(spec);
  if(!Object.keys(imported).length)throw Object.assign(new Error("No callable operations were found in the OpenAPI document"),{code:"OPENAPI_NO_OPERATIONS",statusCode:400});
  const nextConfig={...(conn.config as any||{}),operations:{...((conn.config as any)?.operations||{}),...imported},openApi:{version,title:String(spec.info?.title||"Imported API"),specUrl:input.specUrl||null,operationCount:Object.keys(imported).length}};
  const updated=await prisma.connector.update({where:{id:conn.id},data:{baseUrl,config:nextConfig,lastError:null}});
  return {version,title:String(spec.info?.title||"Imported API"),baseUrl,operationCount:Object.keys(imported).length,operations:imported,connector:{id:updated.id,baseUrl:updated.baseUrl}};
}

function inferFields(value:any,prefix="",out:Set<string>=new Set()):Set<string>{
  if(value==null)return out;
  if(Array.isArray(value)){if(value[0]!==undefined)inferFields(value[0],prefix,out);return out;}
  if(typeof value!=="object")return out;
  for(const [k,v] of Object.entries(value)){
    const path=prefix?`${prefix}.${k}`:k;out.add(path);
    if(v&&typeof v==="object"&&!Array.isArray(v))inferFields(v,path,out);
  }
  return out;
}

export async function discoverConnectorOperation(connectorId:string,organizationId:string,operationKey:string,options?:{body?:any;pathOverride?:string}){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});
  if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  const cfg=conn.config as ConnectorConfig;const op=cfg.operations?.[operationKey];
  if(!op?.path)throw Object.assign(new Error("Operation is not configured"),{code:"CONNECTOR_OPERATION_MISSING",statusCode:400});
  const path=(options?.pathOverride||op.path).replace(/\{([^}]+)\}/g,(m,k)=>{const v=options?.body?.[k]??options?.body?.__pathParams?.[k];return v==null?m:encodeURIComponent(String(v));});
  if(path.includes("{"))throw Object.assign(new Error("This operation requires path parameters. Provide them in the test values."),{code:"CONNECTOR_PATH_PARAMETERS_REQUIRED",statusCode:400});
  const data=await requestExternal(conn,op.method||"GET",path, ["POST","PUT","PATCH"].includes(op.method)?(options?.body||{}):undefined,op.query,op.headers);
  const items=extractItems(data,cfg);const sample=items.slice(0,5);const fields=Array.from(inferFields(sample[0]??data)).slice(0,150);
  return {ok:true,operationKey,method:op.method,path,sample,fields,recordCount:items.length,responseShape:Array.isArray(data)?"array":typeof data};
}



async function microsoftRequest(conn:any,path:string,method="GET",body?:any,query?:Record<string,string>){
  if(conn.provider!=="microsoft-365")throw Object.assign(new Error("Microsoft 365 operations require a Microsoft 365 connector"),{code:"MICROSOFT_PROVIDER_REQUIRED",statusCode:400});
  const data=await requestExternal(conn,method,path,body,query);
  return data;
}
export async function microsoftListWorkbooks(connectorId:string,organizationId:string,queryText=""){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  const data=await microsoftRequest(conn,"/me/drive/root/children","GET",undefined,{"$top":"200"});
  const files=Array.isArray((data as any)?.value)?(data as any).value:[];
  const q=queryText.trim().toLowerCase();
  return {files:files.filter((f:any)=>String(f.name||"").toLowerCase().endsWith(".xlsx")&&(!q||String(f.name||"").toLowerCase().includes(q))).map((f:any)=>({id:f.id,name:f.name,size:f.size,lastModifiedDateTime:f.lastModifiedDateTime,webUrl:f.webUrl}))};
}
export async function microsoftGetWorkbook(connectorId:string,organizationId:string,itemId:string){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  const data=await microsoftRequest(conn,`/me/drive/items/${encodeURIComponent(itemId)}/workbook/worksheets`);
  return {itemId,sheets:Array.isArray((data as any)?.value)?(data as any).value.map((s:any)=>({id:s.id,name:s.name,index:s.position})):[]};
}
export async function microsoftPreviewValues(connectorId:string,organizationId:string,itemId:string,sheetId:string,address="A1:Z30"){
  const conn=await prisma.connector.findFirst({where:{id:connectorId,organizationId}});if(!conn)throw Object.assign(new Error("Connector not found"),{statusCode:404});
  const path=`/me/drive/items/${encodeURIComponent(itemId)}/workbook/worksheets/${encodeURIComponent(sheetId)}/range(address='${encodeURIComponent(address).replace(/%3A/g,":")}')`;
  return microsoftRequest(conn,path);
}

export { getPath, setPath, encrypt, decrypt, requestExternal };

export async function runScheduledConnectorSyncs(){
  const now=Date.now();const connectors=await prisma.connector.findMany({where:{status:{in:["CONNECTED","ERROR"]},direction:{in:["IMPORT","BIDIRECTIONAL"]}}});
  for(const c of connectors){const configured=c.provider==="prms"?Number((c.config as ConnectorConfig).sync?.intervalMinutes||60):Number((c.config as ConnectorConfig).sync?.intervalMinutes||0);if(!Number.isFinite(configured)||configured<=0)continue;const interval=Math.max(15,configured);if(!c.lastSyncAt||now-c.lastSyncAt.getTime()>=interval*60_000){void syncConnector(c.id,c.organizationId).catch(()=>undefined);}}
}
export async function emitConnectorWebhookEvent(organizationId:string,event:string,payload:any){
  const connectors=await prisma.connector.findMany({where:{organizationId,status:"CONNECTED"}});
  for(const c of connectors){const cfg:any=c.config||{};const url=cfg.outboundWebhookUrl;if(!url)continue;try{await requestExternal({...c,baseUrl:url,config:{headers:{"X-SI-Event":event}}},"POST","/",{event,createdAt:new Date().toISOString(),data:payload});}catch(e){await prisma.connector.update({where:{id:c.id},data:{lastError:(e as Error).message,status:"ERROR"}});}}
}
