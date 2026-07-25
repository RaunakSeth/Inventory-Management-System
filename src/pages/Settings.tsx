import { useState } from "react";
import { useSettings, type AIProvider } from "../lib/settings";
import { useNotifications } from "../components/Notifications";
import { Settings, Key, Globe, Cpu, Bell, Save, Zap, Info } from "lucide-react";

const PROVIDERS: { value: AIProvider; label: string; description: string }[] = [
  { value: "openai_compatible", label: "OpenAI Compatible (Ollama, LM Studio, etc.)", description: "Free, runs locally on your machine" },
  { value: "gemini", label: "Google Gemini", description: "Requires API key from Google AI Studio" },
  { value: "none", label: "Disabled (No AI)", description: "Manual entry only, no AI features" },
];

const POPULAR_MODELS = [
  { provider: "openai_compatible" as const, models: ["llava", "bakllava", "moondream", "minicpm-v", "llama3.2-vision", "gpt-4o-mini"] },
  { provider: "gemini" as const, models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"] },
];

export default function SettingsPage() {
  const { settings, updateAI, updateNotifications, testConnection } = useSettings();
  const { addNotification } = useNotifications();
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleTest() {
    setTesting(true);
    const result = await testConnection();
    addNotification({
      type: result.ok ? "success" : "error",
      title: result.ok ? "Connected" : "Connection failed",
      message: result.message,
    });
    setTesting(false);
  }

  function handleSave() {
    setSaved(true);
    addNotification({ type: "success", title: "Settings saved" });
    setTimeout(() => setSaved(false), 2000);
  }

  const modelsForProvider = POPULAR_MODELS.find((p) => p.provider === settings.ai.provider)?.models ?? [];

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-24 pt-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-emerald-400" />
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* AI Configuration */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Cpu className="w-4 h-4" />
          <h2 className="font-semibold">AI Provider</h2>
        </div>

        <div className="space-y-2">
          {PROVIDERS.map((p) => (
            <label
              key={p.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                settings.ai.provider === p.value
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={p.value}
                checked={settings.ai.provider === p.value}
                onChange={() => updateAI({ provider: p.value })}
                className="mt-1 accent-emerald-500"
              />
              <div>
                <span className="text-sm font-medium text-slate-200">{p.label}</span>
                <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>
              </div>
            </label>
          ))}
        </div>

        {settings.ai.provider !== "none" && (
          <>
            <label className="block text-sm">
              <span className="text-slate-400 flex items-center gap-1 mb-1">
                <Key className="w-3 h-3" /> API Key
              </span>
              <input
                type="password"
                value={settings.ai.apiKey}
                onChange={(e) => updateAI({ apiKey: e.target.value })}
                placeholder={settings.ai.provider === "gemini" ? "AIza..." : "sk-... or leave blank for local"}
                className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>

            {settings.ai.provider === "openai_compatible" && (
              <label className="block text-sm">
                <span className="text-slate-400 flex items-center gap-1 mb-1">
                  <Globe className="w-3 h-3" /> API Base URL
                </span>
                <input
                  type="url"
                  value={settings.ai.baseUrl}
                  onChange={(e) => updateAI({ baseUrl: e.target.value })}
                  placeholder="http://localhost:11434/v1"
                  className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Ollama: http://localhost:11434/v1 &middot; LM Studio: http://localhost:1234/v1
                </p>
              </label>
            )}

            <label className="block text-sm">
              <span className="text-slate-400 mb-1 block">Model</span>
              <input
                type="text"
                value={settings.ai.model}
                onChange={(e) => updateAI({ model: e.target.value })}
                placeholder="llava"
                className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              {modelsForProvider.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {modelsForProvider.map((m) => (
                    <button
                      key={m}
                      onClick={() => updateAI({ model: m })}
                      className={`text-xs px-2 py-1 rounded-full border transition ${
                        settings.ai.model === m
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                          : "border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </label>

            <button
              onClick={handleTest}
              disabled={testing || !settings.ai.apiKey}
              className="w-full py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm font-medium hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              {testing ? "Testing..." : "Test Connection"}
            </button>
          </>
        )}

        {settings.ai.provider === "openai_compatible" && !settings.ai.apiKey && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              <strong>Local AI (Ollama):</strong> No API key needed! Just install Ollama, run{" "}
              <code className="bg-blue-500/20 px-1 rounded">ollama pull llava</code>, and leave the API key blank.
            </p>
          </div>
        )}
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
            checked={settings.notifications.lowStock}
            onChange={(e) => updateNotifications({ lowStock: e.target.checked })}
            className="accent-emerald-500 w-4 h-4"
          />
        </label>

        <label className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Expiration warnings</span>
          <input
            type="checkbox"
            checked={settings.notifications.expiringSoon}
            onChange={(e) => updateNotifications({ expiringSoon: e.target.checked })}
            className="accent-emerald-500 w-4 h-4"
          />
        </label>

        {settings.notifications.expiringSoon && (
          <label className="block text-sm">
            <span className="text-slate-400">Days before expiry to warn</span>
            <input
              type="number"
              min={1}
              max={30}
              value={settings.notifications.daysBeforeExpiry}
              onChange={(e) => updateNotifications({ daysBeforeExpiry: Number(e.target.value) })}
              className="w-full mt-1 rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>
        )}
      </section>

      <button
        onClick={handleSave}
        className="w-full py-3 rounded-xl bg-emerald-500 font-semibold flex items-center justify-center gap-2 hover:bg-emerald-400 transition"
      >
        <Save className="w-5 h-5" />
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
