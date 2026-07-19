import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Package, Mail, ArrowRight, CheckCircle } from "lucide-react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

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
    setSending(true);
    await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: import.meta.env.VITE_SITE_URL } });
    setSending(false);
    setSent(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold">PG Inventory</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to manage your stock</p>
          </div>

          {sent ? (
            <div className="text-center space-y-3 bg-slate-900 rounded-2xl p-8 border border-slate-800">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-medium">Check your email</p>
                <p className="text-sm text-slate-500 mt-1">
                  A sign-in link has been sent to<br />
                  <span className="text-emerald-400">{email}</span>
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={sendMagicLink} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl bg-slate-800 pl-10 pr-4 py-3 text-sm border border-slate-700 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition"
                />
              </div>
              <button
                type="submit"
                disabled={sending || !email}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 font-medium text-sm hover:bg-emerald-400 transition disabled:opacity-50"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Send sign-in link
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              <p className="text-xs text-slate-600 text-center">
                Magic link sign-in — no password needed
              </p>
            </form>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
