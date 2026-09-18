"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { subscribeNotifications, type NotificationKind, type NotificationPayload } from "@/lib/notifications";

type Notice = NotificationPayload & { id: string };

const icons: Record<NotificationKind, React.ReactNode> = {
  success: <CheckCircle2 size={17} />,
  info: <Info size={17} />,
  warning: <AlertTriangle size={17} />,
  error: <XCircle size={17} />,
};

export function NotificationCenter() {
  const [items, setItems] = useState<Notice[]>([]);
  useEffect(() => subscribeNotifications((payload) => {
    const id = payload.id || `${Date.now()}-${Math.random()}`;
    const item = { ...payload, id };
    setItems((current) => [...current.filter((x) => x.id !== id), item].slice(-4));
    const duration = payload.durationMs ?? (payload.kind === "error" ? 7000 : 4200);
    window.setTimeout(() => setItems((current) => current.filter((x) => x.id !== id)), duration);
  }), []);
  const dismiss = (id: string) => setItems((current) => current.filter((x) => x.id !== id));
  if (!items.length) return null;
  return <div className="si-notification-stack" aria-live="polite" aria-atomic="false">
    {items.map((item) => <div key={item.id} className={`si-notification ${item.kind}`} role={item.kind === "error" ? "alert" : "status"}>
      <div className="si-notification-icon">{icons[item.kind]}</div>
      <div className="si-notification-copy"><strong>{item.title}</strong>{item.message && <span>{item.message}</span>}</div>
      <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss notification"><X size={15} /></button>
    </div>)}
  </div>;
}
