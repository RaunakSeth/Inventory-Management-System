import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function popupCloseHtml(success: boolean, provider: string, errorMsg?: string): Response {
  const msg = success ? `Connected to ${provider}!` : `Error: ${errorMsg ?? "unknown"}`;
  const html = `<!DOCTYPE html><html><body><script>
    window.opener && window.opener.postMessage({ type: "oauth-result", success: ${success}, provider: "${provider}", error: "${errorMsg ?? ""}" }, "*");
    window.close();
    document.body.textContent = "${msg} — this window should close automatically.";
  </script><p>${msg}</p></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html", ...CORS_HEADERS },
  });
}

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
      return popupCloseHtml(false, "huggingface", error);
    }

    if (!code || !stateParam) {
      return popupCloseHtml(false, "", "Missing code or state");
    }

    let stateData: { uid: string; cv: string };
    try {
      stateData = JSON.parse(atob(stateParam));
    } catch {
      return popupCloseHtml(false, "", "Invalid state");
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

    const tokenRes = await fetch("https://huggingface.co/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return popupCloseHtml(false, "huggingface", `Token exchange failed: ${errText.slice(0, 200)}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token ?? null;
    const expiresIn = tokenData.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Use service role to upsert settings
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
      return popupCloseHtml(false, "huggingface", `DB error: ${upsertErr.message}`);
    }

    return popupCloseHtml(true, "huggingface");
  } catch (err) {
    return popupCloseHtml(false, "", String(err));
  }
});
