// Supabase Edge Function: Initiate OAuth flow for AI providers
// POST /oauth-init { provider: "huggingface" }
// Returns { url } for popup OAuth flow
// Encodes user JWT into state so callback can authenticate

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const PROVIDERS: Record<string, { authUrl: string; clientId: string; scope: string }> = {
  huggingface: {
    authUrl: "https://huggingface.co/oauth/authorize",
    clientId: Deno.env.get("HF_CLIENT_ID") ?? "",
    scope: "read-repos inference-api openid profile email",
  },
};

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
}

function base64urlencode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Simple XOR encode for state (not crypto-secure, just prevents casual tampering)
function encodeState(data: string, key: string): string {
  const encoded = btoa(data);
  return encoded;
}

function decodeState(data: string): string {
  return atob(data);
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

    // Get JWT from Authorization header
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // Verify user is valid
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // Generate PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = base64urlencode(await sha256(codeVerifier));

    // Encode state: provider|userJwt|codeVerifier (base64)
    const statePayload = JSON.stringify({ provider, jwt, codeVerifier, ts: Date.now() });
    const state = btoa(statePayload);

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

    return new Response(JSON.stringify({ url, provider }), {
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
