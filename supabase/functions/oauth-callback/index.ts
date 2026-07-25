// Supabase Edge Function: OAuth callback handler
// GET /oauth-callback?code=xxx&state=xxx
// Decodes state to get user JWT, exchanges code for token, stores in user_settings

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const TOKEN_URLS: Record<string, string> = {
  huggingface: "https://huggingface.co/oauth/token",
};

const CLIENT_SECRETS: Record<string, string> = {
  huggingface: Deno.env.get("HF_CLIENT_SECRET") ?? "",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(`OAuth error: ${error}`, { status: 400, headers: CORS_HEADERS });
    }

    if (!code || !stateParam) {
      return new Response("Missing code or state", { status: 400, headers: CORS_HEADERS });
    }

    // Decode state to get JWT and code_verifier
    let stateData: { provider: string; jwt: string; codeVerifier: string; ts: number };
    try {
      stateData = JSON.parse(atob(stateParam));
    } catch {
      return new Response("Invalid state parameter", { status: 400, headers: CORS_HEADERS });
    }

    // Check state is fresh (10 min max)
    if (Date.now() - stateData.ts > 600000) {
      return new Response("OAuth state expired", { status: 400, headers: CORS_HEADERS });
    }

    const { provider, jwt, codeVerifier } = stateData;

    // Get user from JWT
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response("Not authenticated", { status: 401, headers: CORS_HEADERS });
    }

    // Exchange code for token
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-callback`;
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: Deno.env.get("HF_CLIENT_ID") ?? "",
      code_verifier: codeVerifier,
    });

    // Add client secret if present (for non-PKCE flows)
    const clientSecret = CLIENT_SECRETS[provider];
    if (clientSecret) {
      tokenBody.set("client_secret", clientSecret);
    }

    const tokenRes = await fetch(TOKEN_URLS[provider], {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return new Response(`Token exchange failed (${tokenRes.status}): ${errText}`, {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Upsert user_settings with OAuth tokens
    const { error: upsertErr } = await supabase
      .from("user_settings")
      .upsert({
        user_id: user.id,
        oauth_provider: provider,
        oauth_access_token: accessToken,
        oauth_refresh_token: refreshToken ?? null,
        oauth_token_expires_at: expiresAt,
        ai_provider: provider,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertErr) {
      return new Response(`Database error: ${upsertErr.message}`, {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    // Redirect back to app settings page with success
    const appUrl = Deno.env.get("APP_URL") ?? `${Deno.env.get("SUPABASE_URL")}`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${appUrl}#/settings?oauth=success&provider=${provider}`,
      },
    });
  } catch (err) {
    return new Response(`Error: ${String(err)}`, { status: 500, headers: CORS_HEADERS });
  }
});
