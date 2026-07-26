// Shared AI provider callers

// ---------- Gemini (Google) ----------
export const GEMINI_VISION_CHAIN = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

export async function callGeminiWithFallback(
  apiKey: string,
  parts: unknown[],
  responseSchema: Record<string, unknown>,
  modelChain: string[] = GEMINI_VISION_CHAIN
): Promise<{ modelUsed: string; json: any }> {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  let lastError = null;
  for (const model of modelChain) {
    try {
      const body = JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body }
      );

      if (res.status === 429) { lastError = `${model}: rate limited`; continue; }
      if (!res.ok) {
        const errBody = await res.text();
        if (errBody.includes("RESOURCE_EXHAUSTED") || errBody.includes("quota")) {
          lastError = `${model}: quota exhausted`; continue;
        }
        lastError = `${model}: ${res.status}: ${errBody.slice(0, 300)}`; continue;
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) { lastError = `${model}: empty response`; continue; }

      const jsonStr = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
      return { modelUsed: model, json: JSON.parse(jsonStr) };
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  throw new Error(`Gemini failed: ${lastError}`);
}

// ---------- HuggingFace Inference Providers API ----------
export async function callHuggingFace(
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
): Promise<{ modelUsed: string; json: any }> {
  // Use HF Inference Providers router (OpenAI-compatible)
  const hfModel = model || "llava-hf/llava-v1.6-mistral-7b-hf";

  const body = JSON.stringify({
    model: hfModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    max_tokens: 1024,
  });

  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HF ${hfModel} error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error(`${hfModel}: empty response`);

  const jsonStr = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  return { modelUsed: hfModel, json: JSON.parse(jsonStr) };
}

// ---------- OpenAI-compatible (Groq, Together, Ollama, etc.) ----------
export async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
): Promise<{ modelUsed: string; json: any }> {
  const body = JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    max_tokens: 1024,
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body,
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
