"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, SlidersHorizontal, WalletCards, X, Zap } from "lucide-react";
import { api, type ApiConfig } from "@/lib/api-client";
import { notify } from "@/lib/notifications";

export function MacStudio({config,onClose}:{config:ApiConfig;onClose:()=>void}){
  const [data,setData]=useState<any>(null); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const [form,setForm]=useState<any>({});
  async function load(){setLoading(true);setError("");try{const r=await api.macStatus(config);setData(r);setForm({provider:r.provider,model:r.model,dailyBudgetUsd:r.dailyBudgetUsd,monthlyBudgetUsd:r.monthlyBudgetUsd,maxRequestCostUsd:r.maxRequestCostUsd,maxTokensPerRequest:r.maxTokensPerRequest,cacheEnabled:r.cacheEnabled,autonomousWatch:r.autonomousWatch,watchIntervalMinutes:r.watchIntervalMinutes,notifyEmail:r.notifyEmail})}catch(e){setError(e instanceof Error?e.message:"Unable to load MAC settings.");notify({kind:"error",title:"MAC settings unavailable",message:e instanceof Error?e.message:"Unable to load MAC settings."})}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);
  async function save(){setSaving(true);try{const r=await api.macSettings(config,form);setData((x:any)=>({...x,...r}));notify({kind:"success",title:"MAC policy saved",message:"Model selection and cost controls are now active."})}catch(e){notify({kind:"error",title:"MAC policy not saved",message:e instanceof Error?e.message:"Unable to save MAC settings."})}finally{setSaving(false)}}
  const set=(key:string,value:any)=>setForm((x:any)=>({...x,[key]:value}));
  const catalog=(data?.catalog||[]).filter((x:any)=>x.provider===form.provider);
  return <div className="mac-studio-overlay"><section className="mac-studio-panel">
    <header className="mac-studio-head"><div><span className="eyebrow">MAC STUDIO</span><h1><Zap size={20}/> MAC — Schedule Intelligence's reasoning engine</h1><p>Model routing, privacy policy and cost guardrails. API keys stay on the server and schedule facts are minimized before they leave SI.</p></div><button className="icon-button" onClick={onClose}><X/></button></header>
    {loading?<div className="ai-loading"><Zap className="spin"/><strong>Loading MAC policy…</strong></div>:error?<div className="ai-error"><ShieldCheck size={18}/><span>{error}</span><button className="ghost-button" onClick={()=>void load()}>Retry</button></div>:<>
      <div className="mac-studio-grid">
        <section className="mac-card"><div className="mac-card-title"><SlidersHorizontal size={15}/><div><b>Model selection</b><small>Start with the lowest-cost model; upgrade only when evidence shows a quality need.</small></div></div>
          <label>Provider<select value={form.provider||"gemini"} onChange={e=>{set("provider",e.target.value);const first=(data.catalog||[]).find((x:any)=>x.provider===e.target.value);if(first)set("model",first.model)}}><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option></select></label>
          <label>MAC default model<select value={form.model||""} onChange={e=>set("model",e.target.value)}>{catalog.map((m:any)=><option key={m.model} value={m.model}>{m.label} · {m.role}</option>)}</select></label>
          <div className="mac-model-facts"><span>Configured <b>{catalog.find((m:any)=>m.model===form.model)?.configured?"YES":"NO"}</b></span><span>Input <b>{catalog.find((m:any)=>m.model===form.model)?.inputPerMillion?`$${catalog.find((m:any)=>m.model===form.model).inputPerMillion}/M`:"—"}</b></span><span>Output <b>{catalog.find((m:any)=>m.model===form.model)?.outputPerMillion?`$${catalog.find((m:any)=>m.model===form.model).outputPerMillion}/M`:"—"}</b></span></div>
        </section>
        <section className="mac-card"><div className="mac-card-title"><WalletCards size={15}/><div><b>Cost guard</b><small>MAC blocks requests before they can exceed the configured ceiling.</small></div></div>
          <div className="mac-two"><label>Daily budget ($)<input type="number" min="0.01" step="0.01" value={form.dailyBudgetUsd??1} onChange={e=>set("dailyBudgetUsd",Number(e.target.value))}/></label><label>Monthly budget ($)<input type="number" min="0.01" step="0.01" value={form.monthlyBudgetUsd??10} onChange={e=>set("monthlyBudgetUsd",Number(e.target.value))}/></label></div>
          <div className="mac-two"><label>Max request ($)<input type="number" min="0.001" step="0.001" value={form.maxRequestCostUsd??0.05} onChange={e=>set("maxRequestCostUsd",Number(e.target.value))}/></label><label>Max tokens<input type="number" min="1000" max="24000" step="500" value={form.maxTokensPerRequest??12000} onChange={e=>set("maxTokensPerRequest",Number(e.target.value))}/></label></div>
          <div className="mac-usage"><span>Today <b>${Number(data.usage?.daily||0).toFixed(4)}</b></span><span>Month <b>${Number(data.usage?.monthly||0).toFixed(4)}</b></span><span>Remaining <b>${Number(data.budgetRemaining?.monthly||0).toFixed(4)}</b></span></div>
        </section>
      </div>
      <section className="mac-card mac-policy"><div className="mac-card-title"><ShieldCheck size={15}/><div><b>Privacy & automation</b><small>MINIMAL is enforced: no descriptions, emails, names of resources, external IDs or connector credentials are sent to the model.</small></div></div>
        <label className="mac-check"><input type="checkbox" checked={Boolean(form.cacheEnabled)} onChange={e=>set("cacheEnabled",e.target.checked)}/> Cache identical schedule questions for 15 minutes</label>
        <label className="mac-check"><input type="checkbox" checked={Boolean(form.autonomousWatch)} onChange={e=>set("autonomousWatch",e.target.checked)}/> Allow proactive MAC watch (still subject to budgets and deterministic materiality gates)</label>
        <label>Watch interval<select value={form.watchIntervalMinutes||60} onChange={e=>set("watchIntervalMinutes",Number(e.target.value))}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>Hourly</option><option value={240}>Every 4 hours</option><option value={1440}>Daily</option></select></label>
        <label className="mac-check"><input type="checkbox" checked={Boolean(form.notifyEmail)} onChange={e=>set("notifyEmail",e.target.checked)}/> Email high-severity MAC findings</label>
      </section>
      <div className="mac-studio-footer"><span>AI calls are never required for deterministic schedule calculations.</span><button className="primary-button" onClick={()=>void save()} disabled={saving}>{saving?"Saving…":"Save MAC policy"}</button></div>
    </>}
  </section></div>;
}
