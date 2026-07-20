import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Package, Mail, Lock, User, ArrowRight, CheckCircle, Eye, EyeOff } from "lucide-react";

type Mode = "login" | "signup" | "magic_link_sent" | "set_password";

function sanitize(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function validatePassword(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 8) errors.push("At least 8 characters");
  if (pw.length > 128) errors.push("Max 128 characters");
  if (!/[a-z]/.test(pw)) errors.push("One lowercase letter");
  if (!/[A-Z]/.test(pw)) errors.push("One uppercase letter");
  if (!/[0-9]/.test(pw)) errors.push("One number");
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) errors.push("One special character");
  return errors;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s && mode === "magic_link_sent") {
        setMode("set_password");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [mode]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSending(true);

    const cleanEmail = sanitize(email.trim().toLowerCase());
    if (!validateEmail(cleanEmail)) {
      setErrorMsg("Invalid email address");
      setSending(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      if (error.message.includes("Invalid login")) {
        setErrorMsg("Wrong email or password");
      } else {
        setErrorMsg(error.message);
      }
    }
    setSending(false);
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSending(true);

    const cleanEmail = sanitize(email.trim().toLowerCase());
    const cleanUsername = sanitize(username.trim());

    if (!validateEmail(cleanEmail)) {
      setErrorMsg("Invalid email address");
      setSending(false);
      return;
    }
    if (cleanUsername.length < 2 || cleanUsername.length > 50) {
      setErrorMsg("Username must be 2-50 characters");
      setSending(false);
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setErrorMsg("Username: letters, numbers, underscore only");
      setSending(false);
      return;
    }

    const pwErrors = validatePassword(password);
    if (pwErrors.length > 0) {
      setErrorMsg("Password needs: " + pwErrors.join(", "));
      setSending(false);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords don't match");
      setSending(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { username: cleanUsername },
        emailRedirectTo: import.meta.env.VITE_SITE_URL,
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        setErrorMsg("Email already registered. Try logging in.");
      } else {
        setErrorMsg(error.message);
      }
    } else {
      setMode("magic_link_sent");
    }
    setSending(false);
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSending(true);

    const cleanEmail = sanitize(email.trim().toLowerCase());
    if (!validateEmail(cleanEmail)) {
      setErrorMsg("Invalid email address");
      setSending(false);
      return;
    }

    await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: import.meta.env.VITE_SITE_URL },
    });
    setSending(false);
    setMode("magic_link_sent");
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSending(true);

    const pwErrors = validatePassword(password);
    if (pwErrors.length > 0) {
      setErrorMsg("Password needs: " + pwErrors.join(", "));
      setSending(false);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords don't match");
      setSending(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMsg(error.message);
    }
    setSending(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setMode("login");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setUsername("");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (session) {
    if (mode === "set_password") {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
          <div className="w-full max-w-sm space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold">Set Your Password</h1>
              <p className="text-sm text-slate-500 mt-1">Secure your account with a password</p>
            </div>
            <form onSubmit={handleSetPassword} className="space-y-3">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-slate-800 pl-10 pr-10 py-3 text-sm border border-slate-700 focus:border-emerald-500/50 focus:outline-none transition"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl bg-slate-800 pl-10 pr-4 py-3 text-sm border border-slate-700 focus:border-emerald-500/50 focus:outline-none transition"
                />
              </div>
              <PasswordChecks password={password} />
              {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
              <button type="submit" disabled={sending} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 font-medium text-sm hover:bg-emerald-400 transition disabled:opacity-50">
                {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Set password & continue"}
              </button>
              <button type="button" onClick={() => setMode("login")} className="w-full py-2 text-sm text-slate-500 hover:text-slate-300 transition">
                Skip for now
              </button>
            </form>
          </div>
        </div>
      );
    }

    return <>{children}</>;
  }

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

        {mode === "magic_link_sent" ? (
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
            <button onClick={() => setMode("login")} className="text-sm text-slate-500 hover:text-slate-300 transition">
              Back to login
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2 bg-slate-900 rounded-xl p-1 border border-slate-800 mb-4">
              <button onClick={() => { setMode("login"); setErrorMsg(null); }} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${mode === "login" ? "bg-emerald-500 text-white" : "text-slate-400 hover:text-slate-300"}`}>
                Login
              </button>
              <button onClick={() => { setMode("signup"); setErrorMsg(null); }} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${mode === "signup" ? "bg-emerald-500 text-white" : "text-slate-400 hover:text-slate-300"}`}>
                Sign Up
              </button>
            </div>

            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl bg-slate-800 pl-10 pr-4 py-3 text-sm border border-slate-700 focus:border-emerald-500/50 focus:outline-none transition" />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type={showPassword ? "text" : "password"} required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl bg-slate-800 pl-10 pr-10 py-3 text-sm border border-slate-700 focus:border-emerald-500/50 focus:outline-none transition" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
                <button type="submit" disabled={sending || !email || !password} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 font-medium text-sm hover:bg-emerald-400 transition disabled:opacity-50">
                  {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <>Login <ArrowRight className="w-4 h-4" /></>}
                </button>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
                  <div className="relative flex justify-center"><span className="bg-slate-950 px-3 text-xs text-slate-600">or</span></div>
                </div>
                <button type="button" onClick={handleMagicLink} disabled={sending || !email} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 border border-slate-700 font-medium text-sm text-slate-300 hover:bg-slate-700 transition disabled:opacity-50">
                  {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <>Send magic link <Mail className="w-4 h-4" /></>}
                </button>
              </form>
            )}

            {mode === "signup" && (
              <form onSubmit={handleSignUp} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl bg-slate-800 pl-10 pr-4 py-3 text-sm border border-slate-700 focus:border-emerald-500/50 focus:outline-none transition" />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="text" required placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-xl bg-slate-800 pl-10 pr-4 py-3 text-sm border border-slate-700 focus:border-emerald-500/50 focus:outline-none transition" />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type={showPassword ? "text" : "password"} required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl bg-slate-800 pl-10 pr-10 py-3 text-sm border border-slate-700 focus:border-emerald-500/50 focus:outline-none transition" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type={showPassword ? "text" : "password"} required placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-xl bg-slate-800 pl-10 pr-4 py-3 text-sm border border-slate-700 focus:border-emerald-500/50 focus:outline-none transition" />
                </div>
                <PasswordChecks password={password} />
                {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
                <button type="submit" disabled={sending} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 font-medium text-sm hover:bg-emerald-400 transition disabled:opacity-50">
                  {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <>Create account <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PasswordChecks({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(password) },
    { label: "Lowercase", ok: /[a-z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
    { label: "Special char", ok: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {checks.map((c) => (
        <span key={c.label} className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.ok ? "bg-emerald-900/30 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>
          {c.ok ? "✓" : ""} {c.label}
        </span>
      ))}
    </div>
  );
}
