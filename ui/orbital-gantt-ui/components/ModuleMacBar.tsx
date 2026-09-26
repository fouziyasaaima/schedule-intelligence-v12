"use client";
import { BrainCircuit, Sparkles, ShieldCheck, Zap, ArrowRight } from "lucide-react";
import type { RailView } from "./AppRail";

const meta: Record<RailView,{label:string;hint:string}> = {
  schedule:{label:"Schedule",hint:"Ask MAC to schedule, move, validate or optimize work."},
  network:{label:"Network",hint:"Ask MAC to find dependency bottlenecks, sequence work or repair a safe network."},
  resources:{label:"Resources",hint:"Ask MAC to balance capacity, find overloads or reassign work safely."},
  pulse:{label:"Pulse",hint:"Ask MAC what needs attention now and what action should be taken."},
  forecast:{label:"Forecast",hint:"Ask MAC to explain forecast risk and what schedule changes could improve it."},
  impact:{label:"Impact",hint:"Ask MAC to explain what-if effects and apply a safe schedule change."},
  intelligence:{label:"Intelligence",hint:"Ask MAC to turn schedule signals into decisions and actions."},
  connectors:{label:"Connectors",hint:"Ask MAC to validate imported data, PRMS mappings and publish readiness."},
};

export function ModuleMacBar({module,onOpen}:{module:RailView;onOpen:()=>void}){
 const m=meta[module]||meta.schedule;
 return <div className="module-mac-bar">
   <div className="module-mac-brand"><span className="module-mac-orb"><BrainCircuit size={16}/></span><div><strong>MAC · {m.label}</strong><span>{m.hint}</span></div></div>
   <div className="module-mac-status"><span><ShieldCheck size={12}/> Validated actions</span><span><Zap size={12}/> Live project context</span></div>
   <button className="module-mac-ask" onClick={onOpen}><Sparkles size={14}/><b>Ask MAC</b><small>Ask · act · validate</small><ArrowRight size={12}/></button>
 </div>;
}
