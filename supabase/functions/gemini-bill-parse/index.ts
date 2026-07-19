// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy gemini-bill-parse
//   supabase secrets set GEMINI_API_KEY=your_key_here
//
// Keeping the Gemini key here (server-side) rather than in the frontend is
// deliberate — never ship an LLM API key inside a PWA bundle, anyone can
// read it out of the browser's network tab / JS source.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { callGeminiWithFallback } from "../_shared/gemini.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

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
      JSON.stringify({ ...geminiResult.json, _model_used: geminiResult.modelUsed }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
