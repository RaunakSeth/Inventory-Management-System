import { supabase } from "./supabase";
import { getAIHeaders, type AISettings } from "./settings";
import type { BillParseResult, ProductLookupResult } from "./types";

/** Converts a Blob (photo captured from the webcam) into a base64 string for AI inline_data. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function getStoredAI(): AISettings {
  try {
    const raw = localStorage.getItem("inventory_settings");
    if (!raw) return { provider: "openai_compatible", apiKey: "", baseUrl: "http://localhost:11434/v1", model: "llava" };
    const parsed = JSON.parse(raw);
    return parsed.ai ?? { provider: "openai_compatible", apiKey: "", baseUrl: "http://localhost:11434/v1", model: "llava" };
  } catch {
    return { provider: "openai_compatible", apiKey: "", baseUrl: "http://localhost:11434/v1", model: "llava" };
  }
}

export async function lookupProductByBarcode(barcode: string): Promise<ProductLookupResult> {
  const { data, error } = await supabase.functions.invoke("product-lookup", {
    body: { barcode },
  });
  if (error) throw error;
  return data as ProductLookupResult;
}

export async function identifyProductFromPhoto(photo: Blob): Promise<ProductLookupResult> {
  const image_base64 = await blobToBase64(photo);
  const ai = getStoredAI();
  const { data, error } = await supabase.functions.invoke("product-identify-photo", {
    body: { image_base64, mime_type: photo.type || "image/jpeg" },
    headers: getAIHeaders(ai),
  });
  if (error) throw error;
  return data as ProductLookupResult;
}

export async function parseBillPhoto(photo: Blob): Promise<BillParseResult> {
  const image_base64 = await blobToBase64(photo);
  const ai = getStoredAI();
  const { data, error } = await supabase.functions.invoke("gemini-bill-parse", {
    body: { image_base64, mime_type: photo.type || "image/jpeg" },
    headers: getAIHeaders(ai),
  });
  if (error) throw error;
  return data as BillParseResult;
}
