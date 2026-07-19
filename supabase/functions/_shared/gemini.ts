// Shared by gemini-bill-parse and product-identify-photo. Tries each model
// in order; on a quota/rate-limit response (429, or a RESOURCE_EXHAUSTED
// error body) it moves to the next model instead of failing the request.
// Order is fastest/cheapest-first; each fallback is a small quality step
// down, not a different capability tier.
export const GEMINI_VISION_CHAIN = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

export const GEMINI_TEXT_ONLY_CHAIN = [
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
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  let lastError = null;

  for (const model of modelChain) {
    try {
      const body = JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: formatSchema(responseSchema),
        },
      });

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }
      );

      if (res.status === 429) {
        lastError = `${model}: rate limited (429)`;
        continue;
      }

      if (!res.ok) {
        const errBody = await res.text();
        if (errBody.includes("RESOURCE_EXHAUSTED") || errBody.includes("quota")) {
          lastError = `${model}: quota exhausted (${res.status})`;
          continue;
        }
        lastError = `${model}: error ${res.status}: ${errBody.slice(0, 500)}`;
        continue;
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = `${model}: empty response (no text in candidates)`;
        continue;
      }

      // Handle both plain JSON and markdown code-fenced JSON
      const jsonStr = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
      const json = JSON.parse(jsonStr);
      return { modelUsed: model, json };
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
  }

  throw new Error(`All Gemini models exhausted or failed. Last error: ${lastError}`);
}

// Gemini's responseSchema" nullable is just a plain boolean, pass through as-is.
function formatSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return schema;
}
