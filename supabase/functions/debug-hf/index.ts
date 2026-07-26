import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// Tiny 1x1 red pixel
const TEST_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    if (!jwt) return jsonRes({ error: "No JWT" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return jsonRes({ error: `Auth: ${authErr?.message}` }, 401);

    const { data: settings, error: dbErr } = await supabase
      .from("user_settings")
      .select("ai_api_key, ai_base_url, ai_model")
      .eq("user_id", user.id).single();

    if (dbErr) return jsonRes({ error: `DB: ${dbErr.message}` }, 500);
    if (!settings) return jsonRes({ error: "No settings", userId: user.id }, 404);

    const apiKey = settings.ai_api_key;
    const baseUrl = settings.ai_base_url;
    const model = settings.ai_model;

    if (!apiKey && !baseUrl) return jsonRes({ error: "No key or URL", settings }, 400);

    // Test OpenAI-compatible call
    const isGemini = baseUrl?.includes("generativelanguage.googleapis.com");

    if (isGemini) {
      // Test Gemini
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Say hello" }] }],
        }),
      });
      const text = await res.text();
      return jsonRes({ provider: "gemini", status: res.status, ok: res.ok, body: text.slice(0, 500) });
    } else {
      // Test OpenAI-compatible (Groq, etc.)
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: model || "llama-3.2-11b-vision-preview",
          messages: [{ role: "user", content: "Say hello" }],
          max_tokens: 10,
        }),
      });
      const text = await res.text();
      return jsonRes({ provider: "openai_compatible", baseUrl, model, status: res.status, ok: res.ok, body: text.slice(0, 500) });
    }
  } catch (err) {
    return jsonRes({ error: String(err), stack: err instanceof Error ? err.stack : undefined }, 500);
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
