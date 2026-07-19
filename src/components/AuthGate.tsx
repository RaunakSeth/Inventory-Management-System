import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

/**
 * Simple shared-household auth: anyone with a magic-link email you've
 * invited (via Supabase Auth -> Users, or by just letting them sign in once)
 * gets full read/write access per the RLS policies in 0001_init.sql. No
 * per-user roles/permissions — for a small PG staff, that's appropriate
 * complexity, not a shortcut. Add role-based RLS later if you ever need it.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: import.meta.env.VITE_SITE_URL } });
    setSent(true);
  }

  if (loading) return null;

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <form onSubmit={sendMagicLink} className="w-full max-w-sm space-y-3">
          <h1 className="text-lg font-semibold text-center">PG Inventory</h1>
          {sent ? (
            <p className="text-sm text-emerald-400 text-center">
              Check {email} for a sign-in link.
            </p>
          ) : (
            <>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-slate-800 px-3 py-2"
              />
              <button className="w-full py-2 rounded-lg bg-emerald-500">Send sign-in link</button>
            </>
          )}
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
