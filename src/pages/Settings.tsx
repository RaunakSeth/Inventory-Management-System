import { useState, useEffect, useCallback } from "react";
import { useSettings, type AIProvider } from "../lib/settings";
import { useNotifications } from "../components/Notifications";
import { Settings, Key, Bell, Save, ExternalLink, Check, Zap, Loader2, ChevronDown } from "lucide-react";

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
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState(settings.ai_api_key ?? "");
  const [baseUrl, setBaseUrl] = useState(settings.ai_base_url ?? "");
  const [model, setModel] = useState(settings.ai_model ?? "");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showCustomModel, setShowCustomModel] = useState(false);

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
      <div className="max-w-lg mx-auto pb-24 pt-4 flex items-center justify-center h-64">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-24 pt-4">
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
          <button onClick={handleDisconnect} className="text-xs text-red-400 hover:text-red-300">
            Disable
          </button>
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
                <button
                  onClick={() => selectProvider(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    isSelected
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {isSelected ? "Selected" : "Use"}
                </button>
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
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="http://192.168.1.5:11434/v1"
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
                    />
                  ) : (
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={settings.ai_api_key ? "•••••••• (key saved)" : p.keyPlaceholder}
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
                    />
                  )}

                  {p.id !== "ollama" && p.id !== "gemini" && (
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-slate-400 focus:border-emerald-500 focus:outline-none"
                    />
                  )}

                  {/* Model selector — always a dropdown with fallback models */}
                  {loadingModels ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Fetching available models...
                    </div>
                  ) : displayModels.length > 0 ? (
                    <div className="space-y-1">
                      <div className="relative">
                        <select
                          value={showCustomModel ? "__custom__" : model}
                          onChange={(e) => {
                            if (e.target.value === "__custom__") {
                              setShowCustomModel(true);
                              setModel("");
                            } else {
                              setShowCustomModel(false);
                              setModel(e.target.value);
                            }
                          }}
                          className="w-full appearance-none rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 pr-8 text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          {displayModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                          <option value="__custom__">Custom model name...</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                      {showCustomModel && (
                        <input
                          type="text"
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          placeholder="Enter model name"
                          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
                        />
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="Model name"
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
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
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-emerald-500 font-semibold text-sm hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save Settings"}
      </button>

      {/* Notifications */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Bell className="w-4 h-4" />
          <h2 className="font-semibold">Notifications</h2>
        </div>

        <label className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Low stock alerts</span>
          <input
            type="checkbox"
            checked={settings.notifications_low_stock}
            onChange={(e) => handleSaveNotifications({ notifications_low_stock: e.target.checked })}
            className="accent-emerald-500 w-4 h-4"
          />
        </label>

        <label className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Expiration warnings</span>
          <input
            type="checkbox"
            checked={settings.notifications_expiring}
            onChange={(e) => handleSaveNotifications({ notifications_expiring: e.target.checked })}
            className="accent-emerald-500 w-4 h-4"
          />
        </label>

        {settings.notifications_expiring && (
          <label className="block text-sm">
            <span className="text-slate-400">Days before expiry to warn</span>
            <input
              type="number"
              min={1}
              max={30}
              value={settings.notifications_days_before_expiry}
              onChange={(e) =>
                handleSaveNotifications({ notifications_days_before_expiry: Number(e.target.value) })
              }
              className="w-full mt-1 rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>
        )}
      </section>
    </div>
  );
}
