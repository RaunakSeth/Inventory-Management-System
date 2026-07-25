import { useState, useEffect } from "react";
import { useSettings, type AIProvider } from "../lib/settings";
import { useNotifications } from "../components/Notifications";
import { Settings, Key, Globe, Cpu, Bell, Save, Zap, Info, Link, Unlink, ExternalLink, ChevronRight } from "lucide-react";

const PROVIDERS: { value: AIProvider; label: string; description: string; free?: boolean }[] = [
  { value: "huggingface", label: "Hugging Face", description: "Free tier — OAuth (one-click connect)", free: true },
  { value: "groq", label: "Groq (API Key)", description: "Free tier — fast inference, paste your key", free: true },
  { value: "together", label: "Together AI", description: "Free credits on signup" },
  { value: "gemini", label: "Google Gemini", description: "Requires API key from Google AI Studio" },
  { value: "none", label: "Disabled (No AI)", description: "Manual entry only, no AI features" },
];

const API_PRESETS: Record<string, { label: string; baseUrl: string; model: string }> = {
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.2-11b-vision-preview" },
  together: { label: "Together AI", baseUrl: "https://api.together.xyz/v1", model: "togethercomputer/llava-1.5-7b-hf" },
  ollama: { label: "Ollama (Local)", baseUrl: "http://localhost:11434/v1", model: "llava" },
  lmstudio: { label: "LM Studio", baseUrl: "http://localhost:1234/v1", model: "local-model" },
};

const FREE_PROVIDER_INFO: Record<string, { name: string; url: string; steps: string[] }> = {
  huggingface: {
    name: "Hugging Face",
    url: "https://huggingface.co/settings/tokens",
    steps: [
      "Click 'Connect with Hugging Face' below",
      "Authorize the app in the popup",
      "You're done! Free vision AI enabled",
    ],
  },
};

export default function SettingsPage() {
  const { settings, loading, updateSettings, connectOAuth, disconnectOAuth } = useSettings();
  const { addNotification } = useNotifications();
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState(settings.ai_api_key ?? "");
  const [baseUrl, setBaseUrl] = useState(settings.ai_base_url ?? "http://localhost:11434/v1");
  const [model, setModel] = useState(settings.ai_model ?? "llava");

  async function handleConnect(provider: "huggingface" | "groq" | "together") {
    try {
      await connectOAuth(provider);
      addNotification({ type: "success", title: `Connected to ${FREE_PROVIDER_INFO[provider].name}` });
    } catch (err) {
      addNotification({
        type: "error",
        title: "Connection failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleDisconnect() {
    await disconnectOAuth();
    addNotification({ type: "info", title: "Disconnected from AI provider" });
  }

  async function handleSaveManual() {
    setSaving(true);
    // Detect provider type from base URL
    let provider: AIProvider = "none";
    if (apiKey) {
      if (baseUrl.includes("groq.com")) provider = "gemini"; // Use gemini provider type, edge functions handle OpenAI-compat
      else if (baseUrl.includes("together.xyz")) provider = "gemini";
      else if (baseUrl.includes("generativelanguage.googleapis.com")) provider = "gemini";
      else provider = "gemini"; // Default to gemini provider type for any key
    }
    await updateSettings({
      ai_api_key: apiKey || null,
      ai_base_url: baseUrl,
      ai_model: model,
      ai_provider: provider,
    });
    addNotification({ type: "success", title: "Settings saved" });
    setSaving(false);
  }

  async function handleSaveNotifications(patch: Partial<typeof settings>) {
    await updateSettings(patch);
  }

  // Auto-close popup if this is the OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      addNotification({ type: "success", title: "AI provider connected!" });
      // If in a popup, close it
      if (window.opener) {
        setTimeout(() => window.close(), 1500);
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto pb-24 pt-4 flex items-center justify-center h-64">
        <div className="text-slate-400">Loading settings...</div>
      </div>
    );
  }

  const connectedProvider = settings.oauth_provider;
  const connectedInfo = connectedProvider ? FREE_PROVIDER_INFO[connectedProvider] : null;

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-24 pt-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-emerald-400" />
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* Free AI Providers (OAuth) */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Cpu className="w-4 h-4" />
          <h2 className="font-semibold">Free AI Providers</h2>
        </div>

        {connectedProvider && connectedInfo ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <Link className="w-5 h-5 text-emerald-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-300">Connected to {connectedInfo.name}</p>
                <p className="text-xs text-slate-400">AI features enabled via OAuth</p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              className="w-full py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-medium flex items-center justify-center gap-2 hover:bg-red-500/20"
            >
              <Unlink className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {PROVIDERS.filter((p) => p.free).map((p) => {
              const info = FREE_PROVIDER_INFO[p.value];
              return (
                <div key={p.value} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-slate-200">{p.label}</span>
                      <p className="text-xs text-slate-400">{p.description}</p>
                    </div>
                    <button
                      onClick={() => handleConnect(p.value as "huggingface" | "groq" | "together")}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 hover:bg-emerald-400"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Connect
                    </button>
                  </div>
                  {info && (
                    <ol className="text-xs text-slate-500 space-y-0.5 ml-4 list-decimal">
                      {info.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Manual API Key (for power users) */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Key className="w-4 h-4" />
          <h2 className="font-semibold">API Key</h2>
        </div>
        <p className="text-xs text-slate-500">Paste your API key from any provider. Quick presets below:</p>

        {/* Quick Presets */}
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(API_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => { setBaseUrl(preset.baseUrl); setModel(preset.model); }}
              className={`p-2 rounded-lg border text-left text-xs transition ${
                baseUrl === preset.baseUrl
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <span className="font-medium text-slate-200">{preset.label}</span>
              <span className="block text-slate-500 truncate mt-0.5">{preset.baseUrl.replace("https://", "").replace("http://", "")}</span>
            </button>
          ))}
        </div>

        <label className="block text-sm">
          <span className="text-slate-400 flex items-center gap-1 mb-1">
            <Key className="w-3 h-3" /> API Key
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="gsk_... (Groq) or AIza... (Gemini)"
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-400 flex items-center gap-1 mb-1">
            <Globe className="w-3 h-3" /> API Base URL
          </span>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.groq.com/openai/v1"
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-400 mb-1 block">Model</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="llama-3.2-11b-vision-preview"
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <button
          onClick={handleSaveManual}
          disabled={saving || !apiKey}
          className="w-full py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save API Key"}
        </button>
      </section>

      {/* Notification Settings */}
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
