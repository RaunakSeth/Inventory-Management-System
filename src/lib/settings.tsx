import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type AIProvider = "gemini" | "openai_compatible" | "none";

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AppSettings {
  ai: AISettings;
  notifications: {
    lowStock: boolean;
    expiringSoon: boolean;
    daysBeforeExpiry: number;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    provider: "openai_compatible",
    apiKey: "",
    baseUrl: "http://localhost:11434/v1",
    model: "llava",
  },
  notifications: {
    lowStock: true,
    expiringSoon: true,
    daysBeforeExpiry: 3,
  },
};

const STORAGE_KEY = "inventory_settings";

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, ai: { ...DEFAULT_SETTINGS.ai, ...parsed.ai }, notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface SettingsContextValue {
  settings: AppSettings;
  updateAI: (ai: Partial<AISettings>) => void;
  updateNotifications: (n: Partial<AppSettings["notifications"]>) => void;
  testConnection: () => Promise<{ ok: boolean; message: string }>;
  isConfigured: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => { saveSettings(settings); }, [settings]);

  const updateAI = useCallback((ai: Partial<AISettings>) => {
    setSettings((s) => ({ ...s, ai: { ...s.ai, ...ai } }));
  }, []);

  const updateNotifications = useCallback((n: Partial<AppSettings["notifications"]>) => {
    setSettings((s) => ({ ...s, notifications: { ...s.notifications, ...n } }));
  }, []);

  const testConnection = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const { provider, apiKey, baseUrl, model } = settings.ai;
    if (provider === "none") return { ok: true, message: "AI features disabled" };
    if (!apiKey) return { ok: false, message: "API key is required" };

    try {
      if (provider === "gemini") {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${apiKey}`);
        if (!res.ok) return { ok: false, message: `Gemini error: ${res.status}` };
        return { ok: true, message: `Connected to Gemini (${model})` };
      }
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return { ok: false, message: `Server error: ${res.status}` };
      return { ok: true, message: `Connected to ${baseUrl}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }, [settings.ai]);

  const isConfigured = settings.ai.provider === "none" || (settings.ai.apiKey.length > 0);

  return (
    <SettingsContext.Provider value={{ settings, updateAI, updateNotifications, testConnection, isConfigured }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export function getAIHeaders(settings: AISettings): Record<string, string> {
  const headers: Record<string, string> = {
    "X-AI-Provider": settings.provider,
    "X-AI-Model": settings.model,
  };
  if (settings.apiKey) headers["X-AI-Api-Key"] = settings.apiKey;
  if (settings.baseUrl) headers["X-AI-Base-Url"] = settings.baseUrl;
  return headers;
}
