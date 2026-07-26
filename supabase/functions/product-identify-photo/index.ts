import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGeminiWithFallback, callHuggingFace, callOpenAICompatible, GEMINI_VISION_CHAIN } from "../_shared/gemini.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const SERVER_GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const PROMPT = `Identify the grocery/household product in this photo. Give a short
clean product name, a likely category (e.g. Grains, Spices, Dairy, Cleaning,
Toiletries, Vegetables), the most natural unit to track it in stock by, and
your confidence (0-1). Return ONLY JSON matching this schema:
{"name":"string","brand":"string|null","category":"string","likely_unit":"string","confidence":number}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  try {
    const { image_base64, mime_type } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: "image_base64 required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // Get user settings from DB
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    let aiApiKey = SERVER_GEMINI_KEY;
    let aiBaseUrl = "";
    let aiModel = GEMINI_VISION_CHAIN[0];
    let oauthProvider = "";

    if (jwt) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("ai_api_key, ai_base_url, ai_model, oauth_provider, oauth_access_token")
          .eq("user_id", user.id).single();

        if (settings) {
          oauthProvider = settings.oauth_provider ?? "";
          aiApiKey = settings.oauth_access_token ?? settings.ai_api_key ?? SERVER_GEMINI_KEY;
          aiBaseUrl = settings.ai_base_url ?? "";
          aiModel = settings.ai_model ?? GEMINI_VISION_CHAIN[0];
        }
      }
    }

    let result: { modelUsed: string; json: any };

    if (oauthProvider === "huggingface" && aiApiKey) {
      // HuggingFace: use native API
      result = await callHuggingFace(aiApiKey, aiModel || "llava-hf/llava-1.5-7b-hf", image_base64, mime_type || "image/jpeg", PROMPT);
    } else if (aiBaseUrl && !aiBaseUrl.includes("generativelanguage.googleapis.com")) {
      // OpenAI-compatible (Groq, Together, Ollama, etc.)
      result = await callOpenAICompatible(aiBaseUrl, aiApiKey, aiModel, image_base64, mime_type || "image/jpeg", PROMPT);
    } else if (aiApiKey) {
      // Gemini
      result = await callGeminiWithFallback(aiApiKey, [
        { text: PROMPT },
        { inline_data: { mime_type: mime_type || "image/jpeg", data: image_base64 } },
      ], {} as any);
    } else {
      return new Response(JSON.stringify({ error: "No AI configured. Connect a provider in Settings." }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    return new Response(
      JSON.stringify({ found: true, source: `${oauthProvider || "manual"}_vision`, ...result.json, _model_used: result.modelUsed }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
});
