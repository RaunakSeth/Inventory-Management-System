// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy product-identify-photo
//   supabase secrets set GEMINI_API_KEY=your_key_here
//
// Fallback path: barcode wasn't found in Open Food Facts (common for loose
// produce, local/unbranded goods, or items with damaged barcodes). User
// snaps a photo instead, Gemini vision identifies it, and it's saved to
// product_library with source='gemini_vision' so it's instant next time.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { callGeminiWithFallback } from "../_shared/gemini.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    brand: { type: "string", nullable: true },
    category: { type: "string" },
    likely_unit: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["name", "category", "likely_unit", "confidence"],
};

const PROMPT = `Identify the grocery/household product in this photo, for an
Indian PG (paying-guest accommodation) kitchen/store inventory. Give a short
clean product name, a likely category (e.g. Grains, Spices, Dairy, Cleaning,
Toiletries, Vegetables), the most natural unit to track it in stock by, and
your confidence (0-1). Return ONLY JSON matching the schema.`;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { image_base64, mime_type } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: "image_base64 is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const geminiResult = await callGeminiWithFallback(
      GEMINI_API_KEY,
      [
        { text: PROMPT },
        { inline_data: { mime_type: mime_type || "image/jpeg", data: image_base64 } },
      ],
      RESPONSE_SCHEMA
    );

    return new Response(
      JSON.stringify({ found: true, source: "gemini_vision", ...geminiResult.json, _model_used: geminiResult.modelUsed }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
