import { useState, useEffect } from "react";
import { useSettings, type AIProvider } from "../lib/settings";
import { useNotifications } from "../components/Notifications";
import { Settings, Key, Bell, Save, ExternalLink, Check, Zap } from "lucide-react";

interface ProviderCard {
  id: string;
  name: string;
  description: string;
  free: boolean;
  signupUrl: string;
  docsUrl: string;
  baseUrl: string;
  model: string;
  keyPlaceholder: string;
  keyPrefix: string;
}

const PROVIDERS: ProviderCard[] = [
  {
    id: "groq",
    name: "Groq",
    description: "Free tier — fast inference, vision support",
    free: true,
    signupUrl: "https://console.groq.com/keys",
    docsUrl: "https://console.groq.com/docs/models",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.2-11b-vision-preview",
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
    model: "gemini-2.0-flash",
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
    model: "gpt-4o-mini",
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
    model: "meta-llama/Llama-Vision-Free",
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
    model: "llava",
    keyPlaceholder: "Enter your PC's IP, e.g. http://192.168.1.5:11434/v1",
    keyPrefix: "",
  },
];

function detectProvider(apiKey: string, baseUrl: string): string | null {
  if (apiKey.startsWith("gsk_")) return "groq";
  if (apiKey.startsWith("AIza")) return "gemini";
  if (apiKey.startsWith("sk-")) return "openai";
  if (apiKey.startsWith("tok_")) return "together";
  if (baseUrl.includes("localhost")) return "ollama";
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

  useEffect(() => {
    setApiKey(settings.ai_api_key ?? "");
    setBaseUrl(settings.ai_base_url ?? "");
    setModel(settings.ai_model ?? "");
    if (settings.ai_api_key || settings.ai_base_url) {
      setSelectedProvider(detectProvider(settings.ai_api_key ?? "", settings.ai_base_url ?? ""));
    }
  }, [settings]);

  function selectProvider(p: ProviderCard) {
    setSelectedProvider(p.id);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setApiKey("");
  }

  async function handleSave() {
    setSaving(true);
    await updateSettings({
      ai_api_key: apiKey || null,
      ai_base_url: baseUrl,
      ai_model: model,
      ai_provider: apiKey || baseUrl ? "gemini" : "none",
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
            <span className="text-sm text-emerald-300">AI configured: {selectedProvider ? PROVIDERS.find(p => p.id === selectedProvider)?.name : "Custom"}</span>
          </div>
          <button onClick={handleDisconnect} className="text-xs text-red-400 hover:text-red-300">Disable</button>
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
          const isConfiguredThis = isSelected && !!apiKey;
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
                  {/* Get API Key link */}
                  <a
                    href={p.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {p.id === "ollama" ? "Download Ollama" : "Get API Key"} (opens in new tab)
                  </a>

                  {/* Ollama setup guide */}
                  {p.id === "ollama" && (
                    <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3 space-y-2">
                      <p className="text-xs text-slate-300 font-medium">Setup on your PC:</p>
                      <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                        <li>Install Ollama, run: <code className="bg-slate-700 px-1 rounded">ollama pull llava</code></li>
                        <li>Start server: <code className="bg-slate-700 px-1 rounded">ollama serve</code></li>
                        <li>Find your PC's IP (e.g. <code className="bg-slate-700 px-1 rounded">ipconfig</code> on Windows)</li>
                        <li>Enter the URL below</li>
                      </ol>
                      <p className="text-[10px] text-slate-500">Both devices must be on the same WiFi network</p>
                    </div>
                  )}

                  {/* Base URL input for Ollama, API Key for others */}
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
                      placeholder={p.keyPlaceholder}
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
                    />
                  )}

                  {/* Model input (editable) */}
                  {p.id !== "ollama" && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-slate-400 focus:border-emerald-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-slate-400 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
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
              onChange={(e) => handleSaveNotifications({ notifications_days_before_expiry: Number(e.target.value) })}
              className="w-full mt-1 rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>
        )}
      </section>
    </div>
  );
}
