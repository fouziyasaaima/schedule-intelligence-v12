"use client";
import {useEffect,useState} from "react";
import {useAuth} from "@/lib/auth";
import {useConnection} from "@/lib/connection";
import {GanttWorkspace} from "@/components/GanttWorkspace";
import {LoginScreen} from "@/components/LoginScreen";
import {CompanyOnboarding} from "@/components/CompanyOnboarding";
export default function Page(){const{user,loading}=useAuth();const{config,connect}=useConnection();const[onboard,setOnboard]=useState(false);useEffect(()=>{if(user&&!config)connect({baseUrl:"/api"})},[user,config,connect]);if(loading)return <div className="auth-loading">Loading Schedule Intelligence…</div>;if(!user)return <LoginScreen/>;if(onboard)return <CompanyOnboarding onDone={()=>setOnboard(false)}/>;return config?<GanttWorkspace/>:<div className="auth-loading">Preparing your Schedule Intelligence workspace…</div>}
