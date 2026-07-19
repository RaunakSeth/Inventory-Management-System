// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy product-lookup
//
// Given a scanned barcode, tries Open Food Facts first (free, no key, great
// coverage for packaged food/grocery). Returns { found: false } if nothing
// matches — the frontend should then fall back to the Gemini photo-identify
// flow or a manual add form.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { barcode } = await req.json();
    if (!barcode) {
      return new Response(JSON.stringify({ error: "barcode is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const offRes = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,categories,image_url,quantity`,
      { headers: { "User-Agent": "PG-Inventory-App/1.0 (contact: you@example.com)" } }
    );
    const offData = await offRes.json();

    if (offData.status === 1 && offData.product) {
      const p = offData.product;
      return new Response(
        JSON.stringify({
          found: true,
          source: "open_food_facts",
          barcode,
          name: p.product_name || null,
          brand: p.brands || null,
          category: p.categories?.split(",")[0]?.trim() || null,
          image_url: p.image_url || null,
          pack_size_raw: p.quantity || null, // e.g. "1 kg" — parse client-side if needed
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ found: false, barcode }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
