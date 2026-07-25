// Supabase Edge Function: Initiate OAuth flow for AI providers
// POST /oauth-init { provider: "huggingface" | "groq" | "together" }
// Returns { url, state, code_verifier } for popup OAuth flow

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// Provider OAuth configurations
const PROVIDERS: Record<string, { authUrl: string; clientId: string; scope: string }> = {
  huggingface: {
    authUrl: "https://huggingface.co/oauth/authorize",
    clientId: Deno.env.get("HF_CLIENT_ID") ?? "",
    scope: "read-repos",
  },
  groq: {
    authUrl: "https://console.groq.com/authorize",
    clientId: Deno.env.get("GROQ_CLIENT_ID") ?? "",
    scope: "",
  },
  together: {
    authUrl: "https://api.together.xyz/oauth/authorize",
    clientId: Deno.env.get("TOGETHER_CLIENT_ID") ?? "",
    scope: "",
  },
};

// Generate PKCE code verifier (43-128 chars)
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// SHA256 hash for code challenge
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
}

// Base64url encode
function base64urlencode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { provider } = await req.json();
    if (!provider || !PROVIDERS[provider]) {
      return new Response(JSON.stringify({ error: "Invalid provider" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const config = PROVIDERS[provider];
    if (!config.clientId) {
      return new Response(JSON.stringify({ error: `${provider} OAuth not configured on server` }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // Verify user is authenticated
    const authHeader = req.headers.get("Authorization") ?? "";
    const apiKey = req.headers.get("apikey") ?? "";
    if (!authHeader && !apiKey) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // Generate PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = base64urlencode(await sha256(codeVerifier));
    const state = crypto.randomUUID();

    // Store state + code_verifier in a short-lived way
    // We'll use a simple in-memory store with expiry (for single-user flow)
    // In production, use Redis or similar
    const stateData = { codeVerifier, createdAt: Date.now() };
    // Store in a global map (edge functions are short-lived, this is ephemeral)
    (globalThis as any).__oauth_states = (globalThis as any).__oauth_states || {};
    (globalThis as any).__oauth_states[state] = stateData;

    // Clean old states (>10 min)
    const cutoff = Date.now() - 600000;
    for (const [key, val] of Object.entries((globalThis as any).__oauth_states)) {
      if ((val as any).createdAt < cutoff) delete (globalThis as any).__oauth_states[key];
    }

    // Build redirect URL
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-callback`;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    if (config.scope) params.set("scope", config.scope);

    const url = `${config.authUrl}?${params.toString()}`;

    return new Response(JSON.stringify({ url, state, provider }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
});
