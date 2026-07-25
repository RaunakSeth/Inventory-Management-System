import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { X, AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react";

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

const ICONS: Record<NotificationType, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

const COLORS: Record<NotificationType, string> = {
  info: "bg-blue-500/20 border-blue-500/30 text-blue-200",
  success: "bg-emerald-500/20 border-emerald-500/30 text-emerald-200",
  warning: "bg-amber-500/20 border-amber-500/30 text-amber-200",
  error: "bg-red-500/20 border-red-500/30 text-red-200",
};

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback((n: Omit<Notification, "id">) => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const duration = n.duration ?? (n.type === "error" ? 8000 : 5000);
    setNotifications((prev) => [...prev, { ...n, id }]);
    if (duration > 0) {
      setTimeout(() => removeNotification(id), duration);
    }
  }, [removeNotification]);

  return (
    <NotificationsContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {notifications.map((n) => {
          const Icon = ICONS[n.type];
          return (
            <div
              key={n.id}
              className={`${COLORS[n.type]} border rounded-lg p-3 flex items-start gap-3 shadow-xl backdrop-blur-sm animate-slide-in`}
            >
              <Icon className="w-5 h-5 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{n.title}</p>
                {n.message && <p className="text-xs mt-0.5 opacity-80">{n.message}</p>}
              </div>
              <button onClick={() => removeNotification(n.id)} className="text-current opacity-50 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
