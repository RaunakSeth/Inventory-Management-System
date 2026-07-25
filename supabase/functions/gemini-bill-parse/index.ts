// Supabase Edge Function (Deno): Bill photo parsing
// Fetches user's AI credentials from user_settings table
// Falls back to server-side GEMINI_API_KEY if no user credentials

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGeminiWithFallback, GEMINI_VISION_CHAIN } from "../_shared/gemini.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, X-Client-Info",
};

const SERVER_GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    vendor_name: { type: "string", nullable: true },
    total_amount: { type: "number", nullable: true },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw_text: { type: "string" },
          parsed_name: { type: "string" },
          quantity: { type: "number", nullable: true },
          unit: { type: "string", nullable: true },
          unit_price: { type: "number", nullable: true },
        },
        required: ["raw_text", "parsed_name"],
      },
    },
  },
  required: ["line_items"],
};

const PROMPT = `You are reading a grocery/household supplies bill from an Indian
kitchen/PG (paying-guest accommodation) store. Extract every purchased line item.

Rules:
- "raw_text" must be the line exactly as printed (best-effort OCR), for audit purposes.
- "parsed_name" should be the cleaned-up, human-readable product name (expand
  abbreviations you're confident about, e.g. "TOMATO 1KG" -> "Tomato").
- "quantity" and "unit" describe the pack purchased, e.g. quantity=5, unit="kg"
  for "Rice 5kg", or quantity=1, unit="bottle" for a single bottle. If unit is
  ambiguous, use "pcs".
- Ignore subtotal/tax/discount/total lines — only real product line items.
- If you cannot confidently read a field, leave it null rather than guessing.
- Return ONLY the JSON matching the schema, no extra commentary.`;

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
  responseSchema: Record<string, unknown>,
): Promise<{ modelUsed: string; json: any }> {
  const systemMessage = `You must respond ONLY with valid JSON matching this schema: ${JSON.stringify(responseSchema)}. No extra text.`;
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemMessage },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2048,
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${model} error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error(`${model}: empty response`);

  const jsonStr = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  return { modelUsed: model, json: JSON.parse(jsonStr) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { image_base64, mime_type } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: "image_base64 is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // Get user from JWT
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    let aiProvider = "gemini";
    let aiApiKey = SERVER_GEMINI_KEY;
    let aiBaseUrl = "";
    let aiModel = GEMINI_VISION_CHAIN[0];

    if (jwt) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } }
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("ai_provider, ai_api_key, ai_base_url, ai_model, oauth_provider, oauth_access_token")
          .eq("user_id", user.id)
          .single();

        if (settings) {
          aiProvider = settings.oauth_provider ?? settings.ai_provider ?? "gemini";
          aiApiKey = settings.oauth_access_token ?? settings.ai_api_key ?? SERVER_GEMINI_KEY;
          aiBaseUrl = settings.ai_base_url ?? "";
          aiModel = settings.ai_model ?? GEMINI_VISION_CHAIN[0];
        }
      }
    }

    let result: { modelUsed: string; json: any };

    if (aiProvider === "openai_compatible" && aiBaseUrl) {
      result = await callOpenAICompatible(aiBaseUrl, aiApiKey, aiModel, image_base64, mime_type || "image/jpeg", PROMPT, RESPONSE_SCHEMA);
    } else if (aiApiKey) {
      result = await callGeminiWithFallback(
        aiApiKey,
        [
          { text: PROMPT },
          { inline_data: { mime_type: mime_type || "image/jpeg", data: image_base64 } },
        ],
        RESPONSE_SCHEMA,
        aiProvider === "gemini" ? [aiModel, ...GEMINI_VISION_CHAIN.filter((m) => m !== aiModel)] : GEMINI_VISION_CHAIN,
      );
    } else {
      return new Response(JSON.stringify({ error: "No AI configured. Connect a provider in Settings." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    return new Response(
      JSON.stringify({ ...result.json, _model_used: result.modelUsed }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
});
