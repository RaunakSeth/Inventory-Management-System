// Supabase Edge Function: OAuth callback handler
// GET /oauth-callback?code=xxx&state=xxx
// Exchanges code for token, stores in user_settings, redirects to app

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const TOKEN_URLS: Record<string, string> = {
  huggingface: "https://huggingface.co/oauth/token",
  groq: "https://console.groq.com/oauth/token",
  together: "https://api.together.xyz/oauth/token",
};

const CLIENT_SECRETS: Record<string, string> = {
  huggingface: Deno.env.get("HF_CLIENT_SECRET") ?? "",
  groq: Deno.env.get("GROQ_CLIENT_SECRET") ?? "",
  together: Deno.env.get("TOGETHER_CLIENT_SECRET") ?? "",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    // Determine which provider from stored state
    const states = (globalThis as any).__oauth_states || {};
    const stateData = states[state ?? ""];
    if (!state || !stateData) {
      return new Response("Invalid or expired OAuth state", { status: 400, headers: CORS_HEADERS });
    }

    const provider = url.searchParams.get("provider") ?? "huggingface";

    // Detect provider from state if not provided
    let detectedProvider = provider;
    if (stateData.provider) detectedProvider = stateData.provider;

    if (error) {
      return new Response(`OAuth error: ${error}`, { status: 400, headers: CORS_HEADERS });
    }

    if (!code) {
      return new Response("Missing authorization code", { status: 400, headers: CORS_HEADERS });
    }

    // Clean up state
    delete states[state];

    // Exchange code for token
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-callback`;
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: Deno.env.get(`${detectedProvider.toUpperCase().replace("_", "")}_CLIENT_ID`) ?? "",
      client_secret: CLIENT_SECRETS[detectedProvider] ?? "",
      code_verifier: stateData.codeVerifier,
    });

    const tokenRes = await fetch(TOKEN_URLS[detectedProvider], {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return new Response(`Token exchange failed: ${errText}`, { status: 500, headers: CORS_HEADERS });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Get user from JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response("Not authenticated", { status: 401, headers: CORS_HEADERS });
    }

    // Upsert user_settings with OAuth tokens
    const { error: upsertErr } = await supabase
      .from("user_settings")
      .upsert({
        user_id: user.id,
        oauth_provider: detectedProvider,
        oauth_access_token: accessToken,
        oauth_refresh_token: refreshToken,
        oauth_token_expires_at: expiresAt,
        ai_provider: detectedProvider,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertErr) {
      return new Response(`Database error: ${upsertErr.message}`, { status: 500, headers: CORS_HEADERS });
    }

    // Redirect back to app with success
    const appUrl = Deno.env.get("APP_URL") ?? "/";
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${appUrl}#/settings?oauth=success&provider=${detectedProvider}`,
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return new Response(`Error: ${String(err)}`, { status: 500, headers: CORS_HEADERS });
  }
});
