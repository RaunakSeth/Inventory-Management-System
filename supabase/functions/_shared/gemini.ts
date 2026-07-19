// Shared by gemini-bill-parse and product-identify-photo. Tries each model
// in order; on a quota/rate-limit response (429, or a RESOURCE_EXHAUSTED
// error body) it moves to the next model instead of failing the request.
// Order is fastest/cheapest-first; each fallback is a small quality step
// down, not a different capability tier.
// VISION models support image input; TEXT_ONLY models do not.
export const GEMINI_VISION_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

export const GEMINI_TEXT_ONLY_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

export async function callGeminiWithFallback(
  apiKey: string,
  parts: unknown[],
  responseSchema: Record<string, unknown>,
  modelChain: string[] = GEMINI_VISION_CHAIN
): Promise<{ modelUsed: string; json: any }> {
  let lastError: string | null = null;

  for (const model of modelChain) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema,
            },
          }),
        }
      );

      if (res.status === 429) {
        lastError = `${model}: rate limited (429)`;
        continue; // try next model in the chain
      }

      if (!res.ok) {
        const errBody = await res.text();
        // RESOURCE_EXHAUSTED can also arrive as a 400/403 with this string
        // in the body depending on which quota was hit — treat it the same
        // as a 429 and fall through to the next model.
        if (errBody.includes("RESOURCE_EXHAUSTED") || errBody.includes("quota")) {
          lastError = `${model}: quota exhausted`;
          continue;
        }
        throw new Error(`${model} error ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
      return { modelUsed: model, json: JSON.parse(text) };
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
      // network-level errors also fall through to the next model
      continue;
    }
  }

  throw new Error(`All Gemini models exhausted or failed. Last error: ${lastError}`);
}
