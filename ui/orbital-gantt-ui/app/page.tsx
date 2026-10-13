"use client";
import {useEffect,useState} from "react";
import {useAuth} from "@/lib/auth";
import {useConnection} from "@/lib/connection";
import {GanttWorkspace} from "@/components/GanttWorkspace";
import {LoginScreen} from "@/components/LoginScreen";
import {CompanyOnboarding} from "@/components/CompanyOnboarding";

function decodeEmbedProjectId(token:string){
 try{
   if(!token.startsWith("sie_"))return "";
   const encoded=token.slice(4).split(".")[0];
   const normalized=encoded.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(encoded.length/4)*4,"=");
   const payload=JSON.parse(atob(normalized));
   return payload?.typ==="si-embed"&&typeof payload?.project==="string"?payload.project:"";
 }catch{return "";}
}

export default function Page(){
 const {user,loading}=useAuth();
 const {config,connect}=useConnection();
 const [onboard,setOnboard]=useState(false);
 const [embed,setEmbed]=useState(false);
 const [embedProjectId,setEmbedProjectId]=useState<string>();
 const [embedReady,setEmbedReady]=useState(false);
 const [embedError,setEmbedError]=useState("");
 useEffect(()=>{
   const params=new URLSearchParams(window.location.search);
   const isEmbed=params.get("embed")==="1";
   const projectId=params.get("id")||"";
   setEmbed(isEmbed);
   if(!isEmbed){setEmbedReady(true);return;}
   if(!projectId){setEmbedError("Embedded Schedule Intelligence requires a project id.");setEmbedReady(true);return;}
   let token="";
   const match=window.location.hash.match(/(?:^#|&)siEmbedToken=([^&]+)/);
   if(match) token=decodeURIComponent(match[1]);
   if(token){
     try{window.sessionStorage.setItem(`si-embed-token:${projectId}`,token);}catch{}
     window.history.replaceState(null,"",window.location.pathname+window.location.search);
   } else {
     try{token=window.sessionStorage.getItem(`si-embed-token:${projectId}`)||"";}catch{}
   }
   if(!token){setEmbedError("Embedded access token is missing or expired. Ask the host application to create a new SI embed session.");setEmbedReady(true);return;}

   // The signed embed token carries the canonical SI project id. The host URL
   // may contain an external id (for example PRMS 5431), so use the signed
   // canonical id for all subsequent API calls. The server remains the
   // authority and still validates the token signature and project scope.
   const canonicalProjectId=decodeEmbedProjectId(token)||projectId;
   try{window.sessionStorage.setItem(`si-embed-token:${canonicalProjectId}`,token);}catch{}
   setEmbedProjectId(canonicalProjectId);
   connect({baseUrl:"/api",authToken:token,embedded:true,embedProjectId:canonicalProjectId});
   setEmbedReady(true);
 },[connect]);
 useEffect(()=>{if(user&&!embed&&!config)connect({baseUrl:"/api"})},[user,embed,config,connect]);
 if(embed){
   if(!embedReady)return <div className="auth-loading">Opening embedded Schedule Intelligence…</div>;
   if(embedError)return <div className="auth-loading"><div style={{maxWidth:560,padding:28,border:"1px solid var(--border)",borderRadius:16,background:"var(--panel)"}}><strong>Embedded access unavailable</strong><p style={{marginTop:10,color:"var(--text-dim)"}}>{embedError}</p></div></div>;
   return config&&embedProjectId?<GanttWorkspace embedded initialProjectId={embedProjectId}/>:<div className="auth-loading">Preparing the embedded project…</div>;
 }
 if(loading)return <div className="auth-loading">Loading Schedule Intelligence…</div>;
 if(!user)return <LoginScreen/>;
 if(onboard)return <CompanyOnboarding onDone={()=>setOnboard(false)}/>;
 return config?<GanttWorkspace/>:<div className="auth-loading">Preparing your Schedule Intelligence workspace…</div>;
}
