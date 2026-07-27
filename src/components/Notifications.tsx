import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useToast } from "@astryxdesign/core/Toast";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
}

interface NotificationsContextValue {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const toast = useToast();

  const removeNotification = useCallback((_id: string) => {
    // AstraX Toast handles its own lifecycle
  }, []);

  const addNotification = useCallback(
    (n: Omit<Notification, "id">) => {
      const duration = n.duration ?? (n.type === "error" ? 8000 : 5000);
      const body = n.message ? `${n.title}: ${n.message}` : n.title;
      toast({
        body,
        type: n.type === "error" ? "error" : "info",
        autoHideDuration: duration,
      });
    },
    [toast]
  );

  return (
    <NotificationsContext.Provider value={{ notifications: [], addNotification, removeNotification }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
