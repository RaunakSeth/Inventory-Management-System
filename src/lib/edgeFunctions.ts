import { supabase } from "./supabase";
import type { BillParseResult, ProductLookupResult } from "./types";

/** Compress and resize an image blob to reduce base64 size for AI APIs. */
async function compressImage(blob: Blob, maxDim = 1024): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (compressed) => resolve(compressed || blob),
        "image/jpeg",
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}

/** Converts a Blob into a base64 string. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function compressAndEncode(blob: Blob): Promise<{ base64: string; mime: string }> {
  const compressed = await compressImage(blob);
  const base64 = await blobToBase64(compressed);
  return { base64, mime: compressed.type || "image/jpeg" };
}

/**
 * Turns raw API errors into user-friendly messages.
 * Returns a tuple of [title, detail] for toast notifications.
 */
export function friendlyAIError(err: unknown): { title: string; detail: string } {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("503") || msg.includes("over capacity")) {
    return {
      title: "AI provider is busy",
      detail: "Your AI provider is overloaded right now. Try again in a moment, or switch to a different provider in Settings.",
    };
  }
  if (msg.includes("429") || msg.includes("rate limit")) {
    return {
      title: "Rate limit exceeded",
      detail: "You've hit your provider's rate limit. Wait a minute and try again, or switch providers in Settings.",
    };
  }
  if (msg.includes("401") || msg.includes("403") || msg.includes("invalid")) {
    return {
      title: "Invalid API key",
      detail: "Your API key was rejected. Check it in Settings, or generate a new one from your provider's dashboard.",
    };
  }
  if (msg.includes("404") || msg.includes("not found") || msg.includes("does not exist")) {
    return {
      title: "Model not available",
      detail: "This model doesn't exist or isn't available on your plan. Open Settings and pick a different model from the dropdown.",
    };
  }
  if (msg.includes("No AI configured")) {
    return {
      title: "No AI provider set up",
      detail: "Go to Settings and add an API key for a vision provider (Gemini, Groq, OpenAI, or Together AI).",
    };
  }
  if (msg.includes("image_base64 required")) {
    return {
      title: "No image captured",
      detail: "Take a photo or upload an image first.",
    };
  }

  return {
    title: "AI identification failed",
    detail: `Something went wrong. You can try again, or add the product manually. Error: ${msg.slice(0, 120)}`,
  };
}

export async function lookupProductByBarcode(barcode: string): Promise<ProductLookupResult> {
  const { data, error } = await supabase.functions.invoke("product-lookup", {
    body: { barcode },
  });
  if (error) throw error;
  return data as ProductLookupResult;
}

export async function identifyProductFromPhoto(photo: Blob): Promise<ProductLookupResult> {
  const { base64, mime } = await compressAndEncode(photo);
  const { data, error } = await supabase.functions.invoke("product-identify-photo", {
    body: { image_base64: base64, mime_type: mime },
  });
  if (error) throw error;
  return data as ProductLookupResult;
}

export async function parseBillPhoto(photo: Blob): Promise<BillParseResult> {
  const { base64, mime } = await compressAndEncode(photo);
  const { data, error } = await supabase.functions.invoke("gemini-bill-parse", {
    body: { image_base64: base64, mime_type: mime },
  });
  if (error) throw error;
  return data as BillParseResult;
}
