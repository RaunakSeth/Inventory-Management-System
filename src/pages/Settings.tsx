import { useState, useEffect, useCallback } from "react";
import { useSettings, type AIProvider } from "../lib/settings";
import { useCurrency, CURRENCIES } from "../lib/currency";
import { useNotifications } from "../components/Notifications";
import { supabase } from "../lib/supabase";
import type { Store, QuantityUnit, ProductGroup } from "../lib/types";
import { Button } from "@astryxdesign/core/Button";
import { Switch } from "@astryxdesign/core/Switch";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Section } from "@astryxdesign/core/Section";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";
import { Settings, Bell, Save, ExternalLink, Check, Zap, Loader2, Store as StoreIcon, Package, Tag, Plus, Trash2, Coins, LogOut, UserCircle2 } from "lucide-react";

interface ProviderCard {
  id: string;
  name: string;
  description: string;
  free: boolean;
  signupUrl: string;
  docsUrl: string;
  baseUrl: string;
  defaultModel: string;
  fallbackModels: string[];
  keyPlaceholder: string;
  keyPrefix: string;
}

const PROVIDERS: ProviderCard[] = [
  {
    id: "groq",
    name: "Groq",
    description: "Fast inference, vision support",
    free: false,
    signupUrl: "https://console.groq.com/keys",
    docsUrl: "https://console.groq.com/docs/vision",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "qwen/qwen3.6-27b",
    fallbackModels: ["qwen/qwen3.6-27b"],
    keyPlaceholder: "gsk_...",
    keyPrefix: "gsk_",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Free tier — 15 RPM, 1M tokens/day",
    free: true,
    signupUrl: "https://aistudio.google.com/apikey",
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.0-flash",
    fallbackModels: ["gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash"],
    keyPlaceholder: "AIza...",
    keyPrefix: "AIza",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Paid — GPT-4o vision, best quality",
    free: false,
    signupUrl: "https://platform.openai.com/api-keys",
    docsUrl: "https://platform.openai.com/docs/models",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    fallbackModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    keyPlaceholder: "sk-...",
    keyPrefix: "sk-",
  },
  {
    id: "together",
    name: "Together AI",
    description: "$1 free credits — open source models",
    free: true,
    signupUrl: "https://api.together.xyz/settings/api-keys",
    docsUrl: "https://docs.together.ai/docs/chat-models",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-Vision-Free",
    fallbackModels: ["meta-llama/Llama-Vision-Free", "Qwen/Qwen3.5-9B"],
    keyPlaceholder: "tok_...",
    keyPrefix: "tok_",
  },
  {
    id: "ollama",
    name: "Ollama (Remote)",
    description: "Free — run Ollama on your PC, connect from phone over WiFi",
    free: true,
    signupUrl: "https://ollama.com/download",
    docsUrl: "https://ollama.com/library/llava",
    baseUrl: "",
    defaultModel: "llava",
    fallbackModels: ["llava"],
    keyPlaceholder: "Enter your PC's IP, e.g. http://192.168.1.5:11434/v1",
    keyPrefix: "",
  },
];

// Vision-capable model patterns per provider
const VISION_PATTERNS: Record<string, string[]> = {
  groq: ["qwen", "vision", "llama-4", "llava"],
  gemini: [],
  openai: ["gpt-4o", "gpt-4.1", "o3", "o4"],
  together: ["vision", "llama-4", "Llama-Vision", "mimo", "MiniMax", "Kimi", "Qwen"],
  ollama: ["llava", "llama4", "mimo", "bakllava", "moondream", "minicpm-v"],
};

function isVisionModel(modelId: string, providerId: string): boolean {
  const patterns = VISION_PATTERNS[providerId];
  if (!patterns || patterns.length === 0) return true;
  const lower = modelId.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

async function fetchProviderModels(
  providerId: string,
  apiKey: string,
  baseUrl: string
): Promise<string[]> {
  try {
    if (providerId === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      const models = (data.models || [])
        .filter((m: any) =>
          m.supportedGenerationMethods?.includes("generateContent")
        )
        .map((m: any) => m.name.replace("models/", ""))
        .filter((name: string) =>
          name.includes("flash") || name.includes("pro") || name.includes("gemini")
        );
      return models.length > 0 ? models : [];
    }

    if (providerId === "ollama") {
      if (!baseUrl) return [];
      const tagsUrl = baseUrl.replace(/\/v1\/?$/, "") + "/api/tags";
      const res = await fetch(tagsUrl);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map((m: any) => m.name);
    }

    // OpenAI-compatible providers
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const allModels = (data.data || []).map((m: any) => m.id);
    return allModels.filter((id: string) => isVisionModel(id, providerId));
  } catch {
    return [];
  }
}

function detectProvider(apiKey: string, baseUrl: string): string | null {
  if (apiKey.startsWith("gsk_")) return "groq";
  if (apiKey.startsWith("AIza")) return "gemini";
  if (apiKey.startsWith("sk-")) return "openai";
  if (apiKey.startsWith("tok_")) return "together";
  if (baseUrl.includes("localhost") || baseUrl.includes("192.168")) return "ollama";
  return null;
}

export default function SettingsPage() {
  const { settings, loading, updateSettings } = useSettings();
  const { addNotification } = useNotifications();
  const { currency, setCurrency, baseCurrency, setBaseCurrency } = useCurrency();
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState(settings.ai_api_key ?? "");
  const [baseUrl, setBaseUrl] = useState(settings.ai_base_url ?? "");
  const [model, setModel] = useState(settings.ai_model ?? "");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showCustomModel, setShowCustomModel] = useState(false);

  const [stores, setStores] = useState<Store[]>([]);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreAddress, setNewStoreAddress] = useState("");
  const [units, setUnits] = useState<QuantityUnit[]>([]);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitPlural, setNewUnitPlural] = useState("");
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState("");

  // Reload settings from DB whenever component mounts or settings change
  useEffect(() => {
    setApiKey(settings.ai_api_key ?? "");
    setBaseUrl(settings.ai_base_url ?? "");
    setModel(settings.ai_model ?? "");
    if (settings.ai_api_key || settings.ai_base_url) {
      const detected = detectProvider(settings.ai_api_key ?? "", settings.ai_base_url ?? "");
      setSelectedProvider(detected);
      if (detected) {
        fetchProviderModels(detected, settings.ai_api_key ?? "", settings.ai_base_url ?? "").then(
          (models) => {
            setAvailableModels(models);
          }
        );
      }
    } else {
      setSelectedProvider(null);
      setAvailableModels([]);
    }
  }, [settings]);

  const handleFetchModels = useCallback(
    async (providerId: string, key: string, url: string) => {
      setLoadingModels(true);
      const models = await fetchProviderModels(providerId, key, url);
      setAvailableModels(models);
      setLoadingModels(false);
      if (models.length > 0 && !models.includes(model)) {
        setModel(models[0]);
      }
    },
    [model]
  );

  function selectProvider(p: ProviderCard) {
    setSelectedProvider(p.id);
    setBaseUrl(p.baseUrl);
    setModel(p.defaultModel);
    setApiKey("");
    setAvailableModels([]);
    setShowCustomModel(false);
    // If user already has a key for this provider, fetch models
    if (settings.ai_api_key && detectProvider(settings.ai_api_key, "") === p.id) {
      setApiKey(settings.ai_api_key);
      fetchProviderModels(p.id, settings.ai_api_key, p.baseUrl).then(setAvailableModels);
    }
  }

  // Fetch models when API key changes (debounced)
  useEffect(() => {
    if (!selectedProvider || selectedProvider === "ollama") return;
    if (!apiKey) {
      setAvailableModels([]);
      return;
    }
    const timer = setTimeout(() => {
      handleFetchModels(selectedProvider, apiKey, baseUrl);
    }, 800);
    return () => clearTimeout(timer);
  }, [apiKey, selectedProvider]);

  // Fetch Ollama models when base URL changes
  useEffect(() => {
    if (selectedProvider !== "ollama" || !baseUrl) return;
    const timer = setTimeout(() => {
      handleFetchModels("ollama", "", baseUrl);
    }, 800);
    return () => clearTimeout(timer);
  }, [baseUrl, selectedProvider]);

  // Fetch stores, units, groups
  useEffect(() => {
    supabase.from("stores").select("*").order("name").then(({ data }) => setStores(data ?? []));
    supabase.from("quantity_units").select("*").order("name").then(({ data }) => setUnits(data ?? []));
    supabase.from("product_groups").select("*").order("name").then(({ data }) => setGroups(data ?? []));
  }, []);

  async function handleSave() {
    setSaving(true);
    await updateSettings({
      ai_api_key: apiKey || null,
      ai_base_url: baseUrl,
      ai_model: model,
      ai_provider: apiKey || baseUrl ? (selectedProvider === "gemini" ? "gemini" : "openai_compatible") : "none",
      oauth_provider: null,
      oauth_access_token: null,
    });
    addNotification({ type: "success", title: "Settings saved" });
    setSaving(false);
  }

  async function handleDisconnect() {
    setApiKey("");
    setBaseUrl("");
    setModel("");
    setSelectedProvider(null);
    setAvailableModels([]);
    setShowCustomModel(false);
    await updateSettings({
      ai_api_key: null,
      ai_base_url: null,
      ai_model: null,
      ai_provider: "none",
      oauth_provider: null,
      oauth_access_token: null,
    });
    addNotification({ type: "info", title: "AI disabled" });
  }

  async function handleSaveNotifications(patch: Partial<typeof settings>) {
    await updateSettings(patch);
  }

  async function addStore() {
    if (!newStoreName.trim()) return;
    const { data, error } = await supabase.from("stores").insert({ name: newStoreName.trim(), address: newStoreAddress.trim() || null }).select().single();
    if (error) { addNotification({ type: "error", title: error.message }); return; }
    setStores([...stores, data]);
    setNewStoreName("");
    setNewStoreAddress("");
    addNotification({ type: "success", title: "Store added" });
  }

  async function deleteStore(id: string) {
    await supabase.from("stores").delete().eq("id", id);
    setStores(stores.filter((s) => s.id !== id));
  }

  async function addUnit() {
    if (!newUnitName.trim()) return;
    const { data, error } = await supabase.from("quantity_units").insert({ name: newUnitName.trim(), name_plural: newUnitPlural.trim() || null }).select().single();
    if (error) { addNotification({ type: "error", title: error.message }); return; }
    setUnits([...units, data]);
    setNewUnitName("");
    setNewUnitPlural("");
    addNotification({ type: "success", title: "Unit added" });
  }

  async function deleteUnit(id: string) {
    await supabase.from("quantity_units").delete().eq("id", id);
    setUnits(units.filter((u) => u.id !== id));
  }

  async function addGroup() {
    if (!newGroupName.trim()) return;
    const { data, error } = await supabase.from("product_groups").insert({ name: newGroupName.trim() }).select().single();
    if (error) { addNotification({ type: "error", title: error.message }); return; }
    setGroups([...groups, data]);
    setNewGroupName("");
    addNotification({ type: "success", title: "Group added" });
  }

  async function deleteGroup(id: string) {
    await supabase.from("product_groups").delete().eq("id", id);
    setGroups(groups.filter((g) => g.id !== id));
  }

  const isConfigured = !!settings.ai_api_key || !!settings.oauth_access_token;
  const currentProvider = selectedProvider ? PROVIDERS.find((p) => p.id === selectedProvider) : null;
  // Merge fetched models with fallback defaults (deduplicated)
  const displayModels = [
    ...new Set([
      ...(currentProvider?.fallbackModels ?? []),
      ...availableModels,
    ]),
  ];

  if (loading) {
    return (
      <div className="max-w-xl mx-auto pb-24 pt-4 px-4 flex items-center justify-center h-64">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-24 pt-4 px-4 md:px-6 md:pt-6">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-emerald-400" />
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* Status */}
      {isConfigured && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-300">
              AI configured: {currentProvider?.name ?? "Custom"} — {model || "no model"}
            </span>
          </div>
          <Button label="Disable" variant="ghost" size="sm" onClick={handleDisconnect} />
        </div>
      )}

      {/* Provider Cards */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-slate-300">
          <Zap className="w-4 h-4" />
          <h2 className="font-semibold">Choose AI Provider</h2>
        </div>

        {PROVIDERS.map((p) => {
          const isSelected = selectedProvider === p.id;
          const isConfiguredThis = isSelected && (!!apiKey || !!settings.ai_api_key);
          return (
            <div
              key={p.id}
              className={`rounded-xl border p-4 space-y-3 transition ${
                isSelected
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-slate-800 bg-slate-900 hover:border-slate-600"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-200">{p.name}</span>
                    {p.free && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">
                        FREE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>
                </div>
                <Button
                  label={isSelected ? "Selected" : "Use"}
                  variant={isSelected ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => selectProvider(p)}
                />
              </div>

              {isSelected && (
                <div className="space-y-2 pt-2 border-t border-slate-700/50">
                  <a
                    href={p.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {p.id === "ollama" ? "Download Ollama" : "Get API Key"} (opens in new tab)
                  </a>

                  {p.id === "ollama" && (
                    <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3 space-y-2">
                      <p className="text-xs text-slate-300 font-medium">Setup on your PC:</p>
                      <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                        <li>
                          Install Ollama, run:{" "}
                          <code className="bg-slate-700 px-1 rounded">ollama pull llava</code>
                        </li>
                        <li>
                          Start server: <code className="bg-slate-700 px-1 rounded">ollama serve</code>
                        </li>
                        <li>
                          Find your PC's IP (e.g.{" "}
                          <code className="bg-slate-700 px-1 rounded">ipconfig</code> on Windows)
                        </li>
                        <li>Enter the URL below</li>
                      </ol>
                      <p className="text-[10px] text-slate-500">
                        Both devices must be on the same WiFi network
                      </p>
                    </div>
                  )}

                  {p.id === "ollama" ? (
                    <TextInput
                      label="Server URL"
                      value={baseUrl}
                      onChange={setBaseUrl}
                      placeholder="http://192.168.1.5:11434/v1"
                      width="100%"
                    />
                  ) : (
                    <TextInput
                      type="password"
                      label="API key"
                      value={apiKey}
                      onChange={setApiKey}
                      placeholder={settings.ai_api_key ? "•••••••• (key saved)" : p.keyPlaceholder}
                      width="100%"
                    />
                  )}

                  {p.id !== "ollama" && p.id !== "gemini" && (
                    <TextInput
                      label="Base URL (advanced)"
                      value={baseUrl}
                      onChange={setBaseUrl}
                      placeholder="https://api.example.com/v1"
                      width="100%"
                    />
                  )}

                  {/* Model selector — always a dropdown with fallback models */}
                  {loadingModels ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Fetching available models...
                    </div>
                  ) : displayModels.length > 0 ? (
                    <div className="space-y-2">
                      <Selector
                        label="Model"
                        value={showCustomModel ? "__custom__" : model}
                        onChange={(v) => {
                          if (v === "__custom__") {
                            setShowCustomModel(true);
                            setModel("");
                          } else {
                            setShowCustomModel(false);
                            setModel(v);
                          }
                        }}
                        options={[
                          ...(model && !displayModels.includes(model)
                            ? [{ value: model, label: model }]
                            : []),
                          ...displayModels.map((m) => ({ value: m, label: m })),
                          { value: "__custom__", label: "Custom model name..." },
                        ]}
                        width="100%"
                      />
                      {showCustomModel && (
                        <TextInput
                          label="Model name"
                          value={model}
                          onChange={setModel}
                          placeholder="Enter model name"
                          width="100%"
                        />
                      )}
                    </div>
                  ) : (
                    <TextInput
                      label="Model"
                      value={model}
                      onChange={setModel}
                      placeholder="Model name"
                      width="100%"
                    />
                  )}

                  {isConfiguredThis && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <Check className="w-3 h-3" />
                      {p.id === "ollama" ? "Connected" : "Key saved"}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Save Button */}
      <Button
        label={saving ? "Saving..." : "Save Settings"}
        variant="primary"
        isLoading={saving}
        icon={<Save className="w-4 h-4" />}
        onClick={handleSave}
        width="100%"
      />

      {/* Currency */}
      <Section variant="muted" padding={4}>
        <div className="flex items-center gap-2 mb-3">
          <Coins className="w-4 h-4" />
          <h2 className="font-semibold">Currency</h2>
        </div>
        <p className="text-xs text-slate-400 mb-2">
          Prices are shown in your chosen currency, converted live when needed. Stored prices were entered
          in the base currency below — change it once if your prices were recorded in a different currency.
        </p>
        <Selector
          label="Currency"
          value={currency}
          onChange={(v) => { if (v) setCurrency(v as typeof currency); }}
          options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
          width="100%"
        />
        <div className="mt-3">
          <Selector
            label="Base currency (how prices are stored)"
            value={baseCurrency}
            onChange={(v) => { if (v) setBaseCurrency(v as typeof baseCurrency); }}
            options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
            width="100%"
          />
        </div>
      </Section>

      {/* Notifications */}
      <Section variant="muted" padding={4}>
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4" />
          <h2 className="font-semibold">Notifications</h2>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-300">Low stock alerts</span>
            <Switch
              label="Low stock alerts"
              value={settings.notifications_low_stock}
              onChange={(checked) => handleSaveNotifications({ notifications_low_stock: checked })}
              isLabelHidden
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-300">Expiration warnings</span>
            <Switch
              label="Expiration warnings"
              value={settings.notifications_expiring}
              onChange={(checked) => handleSaveNotifications({ notifications_expiring: checked })}
              isLabelHidden
            />
          </label>

          {settings.notifications_expiring && (
            <NumberInput
              label="Days before expiry to warn"
              value={settings.notifications_days_before_expiry}
              onChange={(val) => handleSaveNotifications({ notifications_days_before_expiry: val ?? 3 })}
              min={1}
              max={30}
            />
          )}
        </div>
      </Section>

      {/* Stores */}
      <Section variant="muted" padding={4}>
        <div className="flex items-center gap-2 mb-3">
          <StoreIcon className="w-4 h-4" />
          <h2 className="font-semibold">Stores</h2>
        </div>
        <List hasDividers>
          {stores.map((store) => (
            <ListItem
              key={store.id}
              label={store.name}
              description={store.address || undefined}
              endContent={
                <IconButton icon={<Trash2 className="w-3.5 h-3.5" />} label={`Delete ${store.name}`} size="sm" onClick={() => deleteStore(store.id)} />
              }
            />
          ))}
        </List>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <TextInput label="" isLabelHidden value={newStoreName} onChange={setNewStoreName} placeholder="Store name" size="sm" />
            <TextInput label="" isLabelHidden value={newStoreAddress} onChange={setNewStoreAddress} placeholder="Address (optional)" size="sm" />
          </div>
          <Button label="Add store" variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} isDisabled={!newStoreName.trim()} onClick={addStore} className="self-start" />
        </div>
      </Section>

      {/* Quantity Units */}
      <Section variant="muted" padding={4}>
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4" />
          <h2 className="font-semibold">Quantity Units</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {units.map((unit) => (
            <div key={unit.id} className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2.5 py-1.5 text-sm text-slate-300">
              <span>{unit.name}</span>
              <IconButton icon={<Trash2 className="w-3 h-3" />} label={`Delete ${unit.name}`} size="sm" onClick={() => deleteUnit(unit.id)} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <TextInput label="" isLabelHidden value={newUnitName} onChange={setNewUnitName} placeholder="Unit (e.g. kg)" size="sm" />
            <TextInput label="" isLabelHidden value={newUnitPlural} onChange={setNewUnitPlural} placeholder="Plural (optional)" size="sm" />
          </div>
          <Button label="Add unit" variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} isDisabled={!newUnitName.trim()} onClick={addUnit} className="self-start" />
        </div>
      </Section>

      {/* Product Groups */}
      <Section variant="muted" padding={4}>
        <div className="flex items-center gap-2 mb-3">
          <Tag className="w-4 h-4" />
          <h2 className="font-semibold">Product Groups</h2>
        </div>
        <List hasDividers>
          {groups.map((group) => (
            <ListItem
              key={group.id}
              label={group.name}
              endContent={
                <IconButton icon={<Trash2 className="w-3 h-3" />} label={`Delete ${group.name}`} size="sm" onClick={() => deleteGroup(group.id)} />
              }
            />
          ))}
        </List>
        <div className="mt-3 flex flex-col gap-2">
          <TextInput label="" isLabelHidden value={newGroupName} onChange={setNewGroupName} placeholder="Group name" size="sm" />
          <Button label="Add group" variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} isDisabled={!newGroupName.trim()} onClick={addGroup} className="self-start" />
        </div>
      </Section>

      {/* Account / Sign out */}
      <Section variant="muted" padding={4}>
        <div className="flex items-center gap-2 mb-3">
          <UserCircle2 className="w-4 h-4" />
          <h2 className="font-semibold">Account</h2>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Sign out of this device. Your data stays safe in the cloud until you sign back in.
        </p>
        <Button
          label="Sign out"
          variant="destructive"
          icon={<LogOut className="w-4 h-4" />}
          onClick={async () => {
            await supabase.auth.signOut();
            addNotification({ type: "success", title: "Signed out", message: "You have been signed out.", duration: 4000 });
          }}
        />
      </Section>
    </div>
  );
}
