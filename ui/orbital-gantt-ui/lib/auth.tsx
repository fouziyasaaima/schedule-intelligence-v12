"use client";
import {createContext,useContext,useEffect,useState,ReactNode} from "react";
export type User={id:string;email:string;firstName:string;lastName:string;emailVerified:boolean;memberships:Array<{organizationId:string;organizationName:string;role:string}>};
const API="/api";
type Ctx={user:User|null;loading:boolean;login:(email:string,password:string)=>Promise<void>;register:(b:any)=>Promise<any>;resendVerification:()=>Promise<void>;logout:()=>Promise<void>;refresh:()=>Promise<void>};
const AuthContext=createContext<Ctx|null>(null);
async function call(path:string,body?:any){const r=await fetch(`${API}${path}`,{method:body?"POST":"GET",credentials:"include",headers:body?{"Content-Type":"application/json",Accept:"application/json"}:{Accept:"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.error||"Request failed") as Error & {code?:string};e.code=j.code;throw e;}return j;}
export function AuthProvider({children}:{children:ReactNode}){const[user,setUser]=useState<User|null>(null);const[loading,setLoading]=useState(true);const refresh=async()=>{try{const j=await call("/v1/me");setUser(j.user)}catch{setUser(null)}finally{setLoading(false)}};useEffect(()=>{void refresh()},[]);const login=async(email:string,password:string)=>{const j=await call("/v1/auth/login",{email,password});setUser(j.user);};const register=async(b:any)=>{const j=await call("/v1/auth/register",b);return j;};const resendVerification=async()=>{await call("/v1/auth/resend-verification",{});};const logout=async()=>{try{await call("/v1/auth/logout",{})}finally{setUser(null)}};return <AuthContext.Provider value={{user,loading,login,register,resendVerification,logout,refresh}}>{children}</AuthContext.Provider>};
export const useAuth=()=>{const c=useContext(AuthContext);if(!c)throw new Error("useAuth must be used inside AuthProvider");return c};
export {API};
