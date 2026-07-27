import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "./supabase";

export type AIProvider = "gemini" | "openai_compatible" | "none";

export type FieldId =
  | "image" | "name" | "category" | "brand" | "barcode"
  | "quantity" | "min_quantity" | "consumption" | "days_left"
  | "location" | "best_before" | "tags" | "last_restocked";

export const ALL_FIELDS: { id: FieldId; label: string }[] = [
  { id: "image", label: "Product image" },
  { id: "name", label: "Product name" },
  { id: "category", label: "Category" },
  { id: "brand", label: "Brand" },
  { id: "barcode", label: "Barcode" },
  { id: "quantity", label: "Quantity" },
  { id: "min_quantity", label: "Reorder at" },
  { id: "consumption", label: "Consumption rate" },
  { id: "days_left", label: "Days remaining" },
  { id: "location", label: "Location" },
  { id: "best_before", label: "Best before" },
  { id: "tags", label: "Labels" },
  { id: "last_restocked", label: "Last restocked" },
];

export const DEFAULT_VISIBLE_FIELDS: FieldId[] = [
  "image", "name", "category", "quantity", "min_quantity",
  "location", "best_before", "consumption", "tags",
];

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
  visible_fields: FieldId[];
}

interface SettingsContextValue {
  settings: UserSettings;
  loading: boolean;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  isConfigured: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>({
    user_id: "",
    ai_provider: "none",
    ai_api_key: null,
    ai_base_url: null,
    ai_model: null,
    oauth_provider: null,
    oauth_access_token: null,
    oauth_refresh_token: null,
    oauth_token_expires_at: null,
    notifications_low_stock: true,
    notifications_expiring: true,
    notifications_days_before_expiry: 3,
    visible_fields: DEFAULT_VISIBLE_FIELDS,
  });
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (data) {
      setSettings(data);
    } else {
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

  const updateSettings = useCallback(async (patch: Partial<UserSettings>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSettings((s) => ({ ...s, ...patch }));

    await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
  }, []);

  const isConfigured = settings.ai_provider === "none"
    ? false
    : !!(settings.ai_api_key || settings.oauth_access_token);

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings, isConfigured }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
