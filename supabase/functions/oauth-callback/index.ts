import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const TOKEN_URLS: Record<string, string> = {
  huggingface: "https://huggingface.co/oauth/token",
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
      const appUrl = Deno.env.get("APP_URL") ?? "https://homeessentialmanager.netlify.app";
      return Response.redirect(`${appUrl}#/settings?oauth=error&msg=${encodeURIComponent(error)}`, 302);
    }

    if (!code || !stateParam) {
      return new Response("Missing code or state", { status: 400, headers: CORS_HEADERS });
    }

    // Decode state: just user_id + code_verifier
    let stateData: { uid: string; cv: string };
    try {
      stateData = JSON.parse(atob(stateParam));
    } catch {
      return new Response("Invalid state", { status: 400, headers: CORS_HEADERS });
    }

    const { uid: userId, cv: codeVerifier } = stateData;

    // Exchange code for token
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-callback`;
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: Deno.env.get("HF_CLIENT_ID") ?? "",
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch(TOKEN_URLS.huggingface, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      const appUrl = Deno.env.get("APP_URL") ?? "https://homeessentialmanager.netlify.app";
      return Response.redirect(`${appUrl}#/settings?oauth=error&msg=${encodeURIComponent(`Token exchange failed: ${errText}`)}`, 302);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token ?? null;
    const expiresIn = tokenData.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Use service role to upsert settings (no user JWT needed)
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: upsertErr } = await adminSupabase
      .from("user_settings")
      .upsert({
        user_id: userId,
        oauth_provider: "huggingface",
        oauth_access_token: accessToken,
        oauth_refresh_token: refreshToken,
        oauth_token_expires_at: expiresAt,
        ai_provider: "huggingface",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertErr) {
      const appUrl = Deno.env.get("APP_URL") ?? "https://homeessentialmanager.netlify.app";
      return Response.redirect(`${appUrl}#/settings?oauth=error&msg=${encodeURIComponent(`DB error: ${upsertErr.message}`)}`, 302);
    }

    // Success — redirect back to app
    const appUrl = Deno.env.get("APP_URL") ?? "https://homeessentialmanager.netlify.app";
    return Response.redirect(`${appUrl}#/settings?oauth=success&provider=huggingface`, 302);
  } catch (err) {
    const appUrl = Deno.env.get("APP_URL") ?? "https://homeessentialmanager.netlify.app";
    return Response.redirect(`${appUrl}#/settings?oauth=error&msg=${encodeURIComponent(String(err))}`, 302);
  }
});
