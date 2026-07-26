import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const TEST_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    const { token } = await req.json();
    if (!token) return jsonRes({ error: "No token" }, 400);

    // Test GLM-4.5V (the one that gave image format error) with real URL
    const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: "zai-org/GLM-4.5V",
        messages: [{ role: "user", content: [
          { type: "text", text: "Describe this image in one word." },
          { type: "image_url", image_url: { url: TEST_URL } },
        ]}],
        max_tokens: 20,
      }),
    });
    const text = await res.text();
    return jsonRes({ status: res.status, ok: res.ok, body: text.slice(0, 500) });
  } catch (err) {
    return jsonRes({ error: String(err) }, 500);
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
