import { useState } from "react";
import { useSettings, type AIProvider } from "../lib/settings";
import { useNotifications } from "../components/Notifications";
import { Settings, Key, Globe, Cpu, Bell, Save, Zap, Info, Link, Unlink, ExternalLink } from "lucide-react";

const PROVIDERS: { value: AIProvider; label: string; description: string; free?: boolean }[] = [
  { value: "huggingface", label: "Hugging Face", description: "Free tier — no API key needed after OAuth", free: true },
  { value: "groq", label: "Groq", description: "Free tier — fast inference, no API key needed", free: true },
  { value: "together", label: "Together AI", description: "Free credits on signup", free: true },
  { value: "gemini", label: "Google Gemini", description: "Requires API key from Google AI Studio" },
  { value: "none", label: "Disabled (No AI)", description: "Manual entry only, no AI features" },
];

const FREE_PROVIDER_INFO: Record<string, { name: string; url: string; steps: string[] }> = {
  huggingface: {
    name: "Hugging Face",
    url: "https://huggingface.co/settings/tokens",
    steps: [
      "Click 'Connect with Hugging Face' below",
      "Authorize the app in the popup",
      "You're done! Free vision AI (llava) enabled",
    ],
  },
  groq: {
    name: "Groq",
    url: "https://console.groq.com/keys",
    steps: [
      "Click 'Connect with Groq' below",
      "Log in or create a free account",
      "Authorize the app — fast inference enabled",
    ],
  },
  together: {
    name: "Together AI",
    url: "https://api.together.xyz/settings/api-keys",
    steps: [
      "Click 'Connect with Together AI' below",
      "Sign up for free credits",
      "Authorize — access to llava and more",
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
    await updateSettings({
      ai_api_key: apiKey || null,
      ai_base_url: baseUrl,
      ai_model: model,
      ai_provider: apiKey ? "gemini" : "none",
    });
    addNotification({ type: "success", title: "Settings saved" });
    setSaving(false);
  }

  async function handleSaveNotifications(patch: Partial<typeof settings>) {
    await updateSettings(patch);
  }

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
          <h2 className="font-semibold">Manual API Key (Optional)</h2>
        </div>
        <p className="text-xs text-slate-500">For power users with their own API key. OAuth above is recommended for most users.</p>

        <label className="block text-sm">
          <span className="text-slate-400 flex items-center gap-1 mb-1">
            <Key className="w-3 h-3" /> API Key
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza... or sk-..."
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-400 flex items-center gap-1 mb-1">
            <Globe className="w-3 h-3" /> API Base URL (for OpenAI-compatible)
          </span>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434/v1"
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-400 mb-1 block">Model</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="llava"
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <button
          onClick={handleSaveManual}
          disabled={saving}
          className="w-full py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm font-medium hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Manual Key"}
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
