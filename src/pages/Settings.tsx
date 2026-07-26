import { useState, useEffect, useCallback } from "react";
import { useSettings, type AIProvider } from "../lib/settings";
import { useNotifications } from "../components/Notifications";
import { Settings, Key, Globe, Cpu, Bell, Save, Link, Unlink, ExternalLink } from "lucide-react";

const API_PRESETS: Record<string, { label: string; baseUrl: string; model: string; placeholder: string }> = {
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.2-11b-vision-preview", placeholder: "gsk_..." },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash", placeholder: "AIza..." },
  together: { label: "Together AI", baseUrl: "https://api.together.xyz/v1", model: "togethercomputer/llava-1.5-7b-hf", placeholder: "tok_..." },
  ollama: { label: "Ollama (Local)", baseUrl: "http://localhost:11434/v1", model: "llava", placeholder: "No key needed" },
};

export default function SettingsPage() {
  const { settings, loading, updateSettings, connectOAuth, disconnectOAuth } = useSettings();
  const { addNotification } = useNotifications();
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState(settings.ai_api_key ?? "");
  const [baseUrl, setBaseUrl] = useState(settings.ai_base_url ?? "");
  const [model, setModel] = useState(settings.ai_model ?? "");

  // Reload settings from DB when they change
  useEffect(() => {
    setApiKey(settings.ai_api_key ?? "");
    setBaseUrl(settings.ai_base_url ?? "");
    setModel(settings.ai_model ?? "");
  }, [settings.ai_api_key, settings.ai_base_url, settings.ai_model]);

  // Listen for OAuth popup result via postMessage
  const handleOAuthMessage = useCallback((e: MessageEvent) => {
    if (e.data?.type === "oauth-result") {
      if (e.data.success) {
        addNotification({ type: "success", title: `Connected to ${e.data.provider}!` });
        // Reload settings from DB
        updateSettings({});
      } else {
        addNotification({ type: "error", title: "OAuth failed", message: e.data.error });
      }
    }
  }, [addNotification, updateSettings]);

  useEffect(() => {
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [handleOAuthMessage]);

  // Handle OAuth redirect in URL params (fallback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("oauth");
    if (oauthResult === "success") {
      addNotification({ type: "success", title: "AI provider connected!" });
      updateSettings({});
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    } else if (oauthResult === "error") {
      addNotification({ type: "error", title: "OAuth failed", message: params.get("msg") ?? "" });
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
  }, []);

  async function handleConnect(provider: "huggingface") {
    try {
      await connectOAuth(provider);
      addNotification({ type: "info", title: "Opening authorization page..." });
    } catch (err) {
      addNotification({
        type: "error",
        title: "Connection failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectOAuth();
      addNotification({ type: "info", title: "Disconnected from AI provider" });
    } catch (err) {
      addNotification({ type: "error", title: "Disconnect failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleSaveManual() {
    setSaving(true);
    let provider: AIProvider = "none";
    if (apiKey) {
      if (baseUrl.includes("generativelanguage.googleapis.com")) provider = "gemini";
      else provider = "gemini"; // All manual keys use gemini provider type; edge functions detect OpenAI-compat from URL
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

  if (loading) {
    return (
      <div className="max-w-lg mx-auto pb-24 pt-4 flex items-center justify-center h-64">
        <div className="text-slate-400">Loading settings...</div>
      </div>
    );
  }

  const connectedProvider = settings.oauth_provider;

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-24 pt-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-emerald-400" />
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* Connected Provider */}
      {connectedProvider ? (
        <section className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <Link className="w-5 h-5 text-emerald-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-300">Connected to {connectedProvider === "huggingface" ? "Hugging Face" : connectedProvider}</p>
              <p className="text-xs text-slate-400">Free AI via OAuth — works on all your devices</p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            className="w-full py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-medium flex items-center justify-center gap-2 hover:bg-red-500/20"
          >
            <Unlink className="w-4 h-4" />
            Disconnect
          </button>
        </section>
      ) : (
        /* Connect Free Provider */
        <section className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-300">
            <Cpu className="w-4 h-4" />
            <h2 className="font-semibold">Free AI (One-Click)</h2>
          </div>
          <p className="text-xs text-slate-500">Connect for free AI vision — no API key needed.</p>
          <button
            onClick={() => handleConnect("huggingface")}
            className="w-full p-3 rounded-lg border border-slate-700 bg-slate-800/50 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition text-left flex items-center gap-3"
          >
            <ExternalLink className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="text-sm font-medium text-slate-200">Connect with Hugging Face</span>
              <p className="text-xs text-slate-500">Free vision AI (llava model)</p>
            </div>
          </button>
        </section>
      )}

      {/* API Key */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Key className="w-4 h-4" />
          <h2 className="font-semibold">API Key</h2>
        </div>
        <p className="text-xs text-slate-500">Or paste your own API key from any provider:</p>

        {/* Presets */}
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(API_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => { setBaseUrl(preset.baseUrl); setModel(preset.model); setApiKey(""); }}
              className={`p-2 rounded-lg border text-left text-xs transition ${
                baseUrl === preset.baseUrl
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
              }`}
            >
              <span className="font-medium text-slate-200">{preset.label}</span>
              <span className="block text-slate-500 truncate mt-0.5">{preset.baseUrl.replace("https://", "").replace("http://", "").split("/")[0]}</span>
            </button>
          ))}
        </div>

        <label className="block text-sm">
          <span className="text-slate-400 mb-1 block">API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={baseUrl.includes("localhost") ? "Not needed for local" : "Paste your API key"}
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-400 mb-1 block">Base URL</span>
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
            placeholder="gemini-2.0-flash"
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <button
          onClick={handleSaveManual}
          disabled={saving}
          className="w-full py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save API Key"}
        </button>
      </section>

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
