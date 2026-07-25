import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "./supabase";

export type AIProvider = "gemini" | "huggingface" | "groq" | "together" | "none";

export interface UserSettings {
  id?: string;
  user_id: string;
  ai_provider: AIProvider;
  ai_api_key: string | null;
  ai_base_url: string | null;
  ai_model: string | null;
  oauth_provider: string | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expires_at: string | null;
  notifications_low_stock: boolean;
  notifications_expiring: boolean;
  notifications_days_before_expiry: number;
}

const DEFAULT_SETTINGS: UserSettings = {
  user_id: "",
  ai_provider: "none",
  ai_api_key: null,
  ai_base_url: "http://localhost:11434/v1",
  ai_model: "llava",
  oauth_provider: null,
  oauth_access_token: null,
  oauth_refresh_token: null,
  oauth_token_expires_at: null,
  notifications_low_stock: true,
  notifications_expiring: true,
  notifications_days_before_expiry: 3,
};

interface SettingsContextValue {
  settings: UserSettings;
  loading: boolean;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  connectOAuth: (provider: "huggingface" | "groq" | "together") => Promise<void>;
  disconnectOAuth: () => Promise<void>;
  isConfigured: boolean;
  activeApiKey: string | null;
  activeProvider: AIProvider;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Load settings from Supabase
  const loadSettings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (data) {
      setSettings(data);
    } else {
      // Create default settings
      const { data: created } = await supabase
        .from("user_settings")
        .insert({ user_id: user.id })
        .select()
        .single();
      if (created) setSettings(created);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Update settings in Supabase
  const updateSettings = useCallback(async (patch: Partial<UserSettings>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSettings((s) => ({ ...s, ...patch }));

    await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
  }, []);

  // Initiate OAuth flow
  const connectOAuth = useCallback(async (provider: "huggingface" | "groq" | "together") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await supabase.functions.invoke("oauth-init", {
      body: { provider },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.error) throw res.error;
    const { url } = res.data;

    // Open popup for OAuth
    const width = 600, height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(url, "oauth", `width=${width},height=${height},left=${left},top=${top}`);

    // Poll for settings change (token stored by callback)
    const pollInterval = setInterval(async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      const { data } = await supabase
        .from("user_settings")
        .select("oauth_provider, oauth_access_token, ai_provider")
        .eq("user_id", currentUser.id)
        .single();

      if (data?.oauth_access_token) {
        clearInterval(pollInterval);
        setSettings((s) => ({
          ...s,
          oauth_provider: data.oauth_provider,
          oauth_access_token: data.oauth_access_token,
          ai_provider: data.ai_provider as AIProvider,
        }));
      }
    }, 1000);

    // Stop polling after 2 minutes
    setTimeout(() => clearInterval(pollInterval), 120000);
  }, [supabase]);

  // Disconnect OAuth
  const disconnectOAuth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.functions.invoke("user-settings", {
      method: "DELETE",
    });

    setSettings((s) => ({
      ...s,
      oauth_provider: null,
      oauth_access_token: null,
      oauth_refresh_token: null,
      oauth_token_expires_at: null,
      ai_provider: "none",
    }));
  }, [supabase]);

  // Determine effective API key and provider
  const activeApiKey = settings.oauth_access_token ?? settings.ai_api_key;
  const activeProvider = settings.oauth_provider as AIProvider ?? settings.ai_provider;
  const isConfigured = settings.ai_provider === "none" || !!activeApiKey;

  return (
    <SettingsContext.Provider value={{
      settings,
      loading,
      updateSettings,
      connectOAuth,
      disconnectOAuth,
      isConfigured,
      activeApiKey,
      activeProvider,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

// Build headers for edge function calls
export function getAIHeaders(settings: UserSettings): Record<string, string> {
  const apiKey = settings.oauth_access_token ?? settings.ai_api_key ?? "";
  const provider = settings.oauth_provider ?? settings.ai_provider;

  const headers: Record<string, string> = {
    "X-AI-Provider": provider,
  };
  if (apiKey) headers["X-AI-Api-Key"] = apiKey;
  if (settings.ai_base_url) headers["X-AI-Base-Url"] = settings.ai_base_url;
  if (settings.ai_model) headers["X-AI-Model"] = settings.ai_model;
  return headers;
}
