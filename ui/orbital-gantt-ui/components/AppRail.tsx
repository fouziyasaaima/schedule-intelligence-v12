"use client";
import { CalendarRange, Command, Gauge, Network, Orbit, Users, WandSparkles, BookOpen, BarChart3, GitCompareArrows, ChevronLeft, ChevronRight, ShieldCheck, BrainCircuit, PlugZap } from "lucide-react";
import { APP_VERSION } from "@/lib/version";

export type RailView = "schedule" | "network" | "resources" | "pulse" | "forecast" | "impact" | "intelligence" | "connectors";

export function AppRail({
  active,
  onChange,
  onCommand,
  expanded,
  onToggle,
  onMac,
}: {
  active: RailView;
  onChange: (v: RailView) => void;
  onCommand: () => void;
  expanded: boolean;
  onToggle: () => void;
  onMac: () => void;
}) {
  const items = [
    ["schedule", CalendarRange, "Schedule", "Plan the work"],
    ["network", Network, "Network", "See dependencies"],
    ["resources", Users, "Resources", "Resource Orbit"],
    ["forecast", BarChart3, "Forecast", "Monte Carlo forecast"],
    ["impact", GitCompareArrows, "Impact", "What-if scenarios"],
    ["pulse", Gauge, "Pulse", "Schedule health"],
    ["intelligence", BrainCircuit, "Intelligence", "Decision cockpit"],
    ["connectors", PlugZap, "Connectors", "External app sync"],
  ] as const;

  return <aside className={`app-rail ${expanded ? "expanded" : "collapsed"}`}>
    <button className="rail-brand" onClick={onToggle} aria-label={expanded ? "Collapse navigation" : "Expand navigation"} title={expanded ? "Collapse navigation" : "Expand navigation"}>
      <span className="rail-brand-orbit"><Orbit size={20}/></span>
      {expanded && <span className="rail-brand-copy"><b>Schedule Intelligence</b><small>SCHEDULE OS</small></span>}
    </button>

    <div className="rail-expand-hint"><span>PROJECT CONTROL</span></div>
    <nav className="rail-stack" aria-label="Schedule Intelligence navigation">
      {items.map(([id, Icon, label, hint]) => <button key={id} className={`rail-button ${active===id?"active":""}`} onClick={()=>{if(!expanded) onToggle(); onChange(id)}} title={expanded ? hint : label}>
        <span className="rail-icon"><Icon size={18}/></span>
        {expanded && <span className="rail-copy"><b>{label}</b><small>{hint}</small></span>}
        <span className="mobile-rail-label">{label}</span>
        {expanded && active===id && <i className="rail-active-pulse"/>}
      </button>)}
    </nav>

    <div className="rail-bottom">
      <button className="rail-button rail-mac-launch" onClick={onMac} title="Open MAC — Schedule Intelligence agent">
        <span className="rail-icon"><BrainCircuit size={18}/></span>
        {expanded && <span className="rail-copy"><b>MAC</b><small>Ask · act · validate</small></span>}
      </button>
      <button className="rail-button command" onClick={onCommand} title="Schedule Intelligence Command">
        <span className="rail-icon"><Command size={18}/></span>
        {expanded && <span className="rail-copy"><b>Command</b><small>Jump anywhere</small></span>}
        {expanded && <kbd>⌘K</kbd>}
      </button>
      <button className="rail-button" onClick={()=>window.location.assign("/api-docs")} title="API Documentation">
        <span className="rail-icon"><BookOpen size={18}/></span>
        {expanded && <span className="rail-copy"><b>API Docs</b><small>Build with Schedule Intelligence</small></span>}
      </button>
      {expanded && <div className="rail-secure"><ShieldCheck size={13}/><span>API connection protected</span><i/></div>}
      <button className="rail-toggle" onClick={onToggle} title={expanded ? "Collapse rail" : "Expand rail"}>
        {expanded ? <ChevronLeft size={16}/> : <ChevronRight size={16}/>} {expanded && <span>{"Collapse rail"}</span>}
      </button>
      {expanded && <div className="rail-spark"><WandSparkles size={15}/><span>Designed beyond the grid</span></div>}
      {expanded && <div className="rail-version">Version {APP_VERSION}</div>}
    </div>
  </aside>;
}
