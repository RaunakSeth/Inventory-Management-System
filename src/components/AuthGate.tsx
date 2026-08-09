import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
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

/**
 * The URL the magic-link / confirmation emails should land on.
 * Prefers the live site origin so it always matches whichever domain is
 * currently serving the app (dev, staging or production). Falls back to the
 * build-time VITE_SITE_URL when not running in a browser.
 */
function siteUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return import.meta.env.VITE_SITE_URL || "";
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
        emailRedirectTo: siteUrl(),
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
      options: { emailRedirectTo: siteUrl() },
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
            <form onSubmit={handleSetPassword} className="space-y-5">
              <div className="relative">
                <TextInput
                  label="New password"
                  isLabelHidden
                  type={showPassword ? "text" : "password"}
                  size="lg"
                  value={password}
                  onChange={setPassword}
                  placeholder="New password"
                  isRequired
                  startIcon={<Lock className="w-4 h-4" />}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <TextInput
                  label="Confirm password"
                  isLabelHidden
                  type={showPassword ? "text" : "password"}
                  size="lg"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Confirm password"
                  isRequired
                  startIcon={<Lock className="w-4 h-4" />}
                />
              </div>
              <PasswordChecks password={password} />
              {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
              <Button
                label={sending ? "Setting password..." : "Set password & continue"}
                type="submit"
                variant="primary"
                width="100%"
                isLoading={sending}
                isDisabled={sending}
              />
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
          <h1 className="text-2xl font-bold">Inventory Manager</h1>
          <p className="text-sm text-slate-500 mt-1">Track stock, shopping, and supplies</p>
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
            <div className="mb-6">
              <SegmentedControl
                label="Auth mode"
                value={mode === "signup" ? "signup" : "login"}
                onChange={(v) => { setMode(v as "login" | "signup"); setErrorMsg(null); }}
                layout="fill"
                size="lg"
              >
                <SegmentedControlItem value="login" label="Login" />
                <SegmentedControlItem value="signup" label="Sign Up" />
              </SegmentedControl>
            </div>

            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-5">
                <TextInput
                  label="Email"
                  isLabelHidden
                  type="email"
                  size="lg"
                  value={email}
                  onChange={setEmail}
                  placeholder="Email"
                  isRequired
                  startIcon={<Mail className="w-4 h-4" />}
                />
                <div className="relative">
                  <TextInput
                    label="Password"
                    isLabelHidden
                    type={showPassword ? "text" : "password"}
                    size="lg"
                    value={password}
                    onChange={setPassword}
                    placeholder="Password"
                    isRequired
                    startIcon={<Lock className="w-4 h-4" />}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
                <Button
                  label={sending ? "Logging in..." : "Login"}
                  type="submit"
                  variant="primary"
                  width="100%"
                  isLoading={sending}
                  isDisabled={sending || !email || !password}
                  icon={<ArrowRight className="w-4 h-4" />}
                />
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
                  <div className="relative flex justify-center"><span className="bg-slate-950 px-3 text-xs text-slate-600">or</span></div>
                </div>
                <Button
                  label={sending ? "Sending link..." : "Send magic link"}
                  type="button"
                  variant="secondary"
                  width="100%"
                  isLoading={sending}
                  isDisabled={sending || !email}
                  onClick={handleMagicLink}
                  icon={<Mail className="w-4 h-4" />}
                />
              </form>
            )}

            {mode === "signup" && (
              <form onSubmit={handleSignUp} className="space-y-5">
                <TextInput
                  label="Email"
                  isLabelHidden
                  type="email"
                  size="lg"
                  value={email}
                  onChange={setEmail}
                  placeholder="Email"
                  isRequired
                  startIcon={<Mail className="w-4 h-4" />}
                />
                <TextInput
                  label="Username"
                  isLabelHidden
                  type="text"
                  size="lg"
                  value={username}
                  onChange={setUsername}
                  placeholder="Username"
                  isRequired
                  startIcon={<User className="w-4 h-4" />}
                />
                <div className="relative">
                  <TextInput
                    label="Password"
                    isLabelHidden
                    type={showPassword ? "text" : "password"}
                    size="lg"
                    value={password}
                    onChange={setPassword}
                    placeholder="Password"
                    isRequired
                    startIcon={<Lock className="w-4 h-4" />}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <TextInput
                  label="Confirm password"
                  isLabelHidden
                  type={showPassword ? "text" : "password"}
                  size="lg"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Confirm password"
                  isRequired
                  startIcon={<Lock className="w-4 h-4" />}
                />
                <PasswordChecks password={password} />
                {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
                <Button
                  label={sending ? "Creating account..." : "Create account"}
                  type="submit"
                  variant="primary"
                  width="100%"
                  isLoading={sending}
                  isDisabled={sending}
                  icon={<ArrowRight className="w-4 h-4" />}
                />
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
