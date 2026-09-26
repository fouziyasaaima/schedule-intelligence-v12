export type NotificationKind = "success" | "info" | "warning" | "error";

export type NotificationPayload = {
  id?: string;
  kind: NotificationKind;
  title: string;
  message?: string;
  durationMs?: number;
};

const EVENT = "si:notification";

export function notify(payload: NotificationPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NotificationPayload>(EVENT, { detail: payload }));
}

export function subscribeNotifications(listener: (payload: NotificationPayload) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<NotificationPayload>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
