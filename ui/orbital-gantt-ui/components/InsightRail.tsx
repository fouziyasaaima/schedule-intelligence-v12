"use client";

import { useEffect, useState } from "react";
import { X, Sparkles, TriangleAlert } from "lucide-react";
import type { Task, Dependency } from "@/types/gantt";
import type { ApiConfig } from "@/lib/api-client";
import { api } from "@/lib/api-client";

interface Props {
  task: Task | null;
  tasks: Task[];
  dependencies: Dependency[];
  config: ApiConfig;
  onClose: () => void;
}

export function InsightRail({ task, tasks, dependencies, config, onClose }: Props) {
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!task) { setReasoning(null); setLoading(false); return; }
    setLoading(true);
    setReasoning(null);
    api
      .explainTask(config, task.id)
      .then((r) => setReasoning(r.reasoning))
      .catch(() => setReasoning("Couldn't reach the insights service for this task."))
      .finally(() => setLoading(false));
  }, [task?.id, config]);

  const open = true;
  const criticalCount = tasks.filter((t) => t.isCritical).length;
  const riskCount = tasks.filter((t) => t.targetFeasible === false).length;
  const activeDependencyCount = dependencies.filter((d) => d.isActive).length;
  const avgProgress = tasks.length ? Math.round(tasks.reduce((sum, t) => sum + (t.progressPct || 0), 0) / tasks.length) : 0;
  const projectInsight = criticalCount === 0 && riskCount === 0
    ? "The schedule currently has no critical-path or target-feasibility breach signals."
    : `${criticalCount} critical task${criticalCount === 1 ? "" : "s"} and ${riskCount} target-risk signal${riskCount === 1 ? "" : "s"} are shaping attention.`;

  return (
    <aside className="insight-rail"
      style={{
        ...styles.rail,
        transform: open ? "translateX(0)" : "translateX(100%)",
      }}
    >
      <div style={styles.header}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={14} style={{ color: "var(--amber)" }} />
              <span style={styles.headerTitle}>Insights</span>
            </div>
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={16} />
            </button>
      </div>

      <div style={styles.body}>
        {task ? <>
            <div style={styles.taskName}>{task.name}</div>

            <div style={styles.badgeRow}>
              <span
                style={{
                  ...styles.badge,
                  background: task.isCritical ? "var(--coral-dim)" : "var(--panel-raised)",
                  color: task.isCritical ? "var(--coral)" : "var(--text-dim)",
                }}
              >
                {task.isCritical ? "On critical path" : "Has slack"}
              </span>
              {task.slackDays !== null && (
                <span className="mono" style={styles.slack}>
                  {task.slackDays}d slack
                </span>
              )}
            </div>

            {task.targetDate && task.targetFeasible === false && (
              <div style={styles.warning}>
                <TriangleAlert size={13} style={{ color: "var(--coral)", flexShrink: 0 }} />
                <span>
                  Target date is at risk — current schedule finishes after{" "}
                  {new Date(task.targetDate).toLocaleDateString()}.
                </span>
              </div>
            )}

            <div style={styles.sectionLabel}>Why this date</div>
            <div style={styles.reasoning}>
              {loading ? "Analyzing schedule…" : reasoning}
            </div>
          </> : <>
            <div style={styles.taskName}>Schedule intelligence</div>
            <div style={styles.badgeRow}>
              <span style={{...styles.badge, background: "var(--panel-raised)", color: "var(--text-dim)"}}>Live project view</span>
            </div>
            <div style={styles.summaryGrid}>
              <div><b>{tasks.length}</b><span>work items</span></div>
              <div><b>{activeDependencyCount}</b><span>dependencies</span></div>
              <div><b>{criticalCount}</b><span>critical</span></div>
              <div><b>{avgProgress}%</b><span>avg progress</span></div>
            </div>
            <div style={styles.sectionLabel}>Current signal</div>
            <div style={styles.reasoning}>{projectInsight}</div>
            <div style={styles.sectionLabel}>How to use Insights</div>
            <div style={styles.reasoning}>Select a task to explain its dates, slack, target pressure and dependency drivers. With no selection, this panel summarizes the live schedule.</div>
          </>}
        </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  rail: {
    width: 300,
    flexShrink: 0,
    background: "var(--panel)",
    borderLeft: "1px solid var(--border)",
    transition: "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 14px",
    borderBottom: "1px solid var(--border)",
  },
  headerTitle: { fontSize: 12, fontWeight: 600, letterSpacing: "0.01em" },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    display: "flex",
    padding: 4,
  },
  body: { padding: 16, overflowY: "auto" },
  taskName: { fontSize: 14, fontWeight: 600, marginBottom: 12 },
  badgeRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  badge: {
    fontSize: 10,
    padding: "3px 8px",
    borderRadius: 3,
    fontWeight: 600,
  },
  slack: { fontSize: 11, color: "var(--text-dim)" },
  warning: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    background: "var(--coral-dim)",
    borderRadius: 4,
    fontSize: 12,
    lineHeight: 1.5,
    marginBottom: 16,
    color: "var(--text)",
  },
  sectionLabel: {
    fontSize: 10,
    color: "var(--text-faint)",
    marginBottom: 6,
    marginTop: 8,
  },
  reasoning: {
    fontSize: 12.5,
    lineHeight: 1.6,
    color: "var(--text-dim)",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 18,
  },
};
