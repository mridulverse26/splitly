import { useState } from "react";
import { auth } from "./store";
import { Button, Field, Input, PasswordInput } from "./components";

export function LoginScreen() {
  const [mode, setMode] = useState("signin");
  const heading =
    mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password";
  const sub =
    mode === "signin"
      ? "Sign in to your Splitly account."
      : mode === "signup"
      ? "Email and a password — that's it."
      : "We'll email you a link to set a new password.";

  return (
    <div className="min-h-full max-w-md mx-auto px-5 pt-10 pb-12 flex flex-col">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent-600 flex items-center justify-center text-white font-bold text-lg">S</div>
        <div>
          <div className="font-bold text-xl leading-tight">Splitly</div>
          <div className="text-xs text-slate-500">Split bills with friends</div>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
        <p className="text-sm text-slate-500 mt-1">{sub}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-5">
        {mode !== "reset" && (
          <div className="flex bg-slate-100 rounded-xl p-1 mb-5 text-sm font-semibold">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 py-1.5 rounded-lg transition ${mode === "signin" ? "bg-white shadow-sm text-ink" : "text-slate-500"}`}
            >Sign in</button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 rounded-lg transition ${mode === "signup" ? "bg-white shadow-sm text-ink" : "text-slate-500"}`}
            >Sign up</button>
          </div>
        )}
        {mode === "signin" && <SignInForm onForgot={() => setMode("reset")} />}
        {mode === "signup" && <SignUpForm />}
        {mode === "reset" && <ResetPasswordForm onBack={() => setMode("signin")} />}
      </div>

      <p className="text-[11px] text-slate-400 text-center mt-6 leading-relaxed">
        Backed by Supabase Auth. Your data is private to your account (Postgres Row-Level Security).
      </p>
    </div>
  );
}

function SignInForm({ onForgot }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) return setError("Enter email and password");
    setLoading(true);
    try {
      await auth.signIn({ email, password });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Field label="Email">
        <Input
          autoFocus
          type="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>
      <Field label="Password">
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </Field>
      <div className="-mt-2 mb-3 text-right">
        <button
          type="button"
          onClick={() => onForgot?.(email)}
          className="text-xs font-semibold text-accent-700 hover:text-accent-800"
        >Forgot password?</button>
      </div>
      {error && <div className="text-sm text-red-600 mb-3 -mt-1">{error}</div>}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}

function SignUpForm() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!displayName.trim()) return setError("Display name is required");
    if (!email.trim()) return setError("Email is required");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setLoading(true);
    try {
      await auth.signUp({ email, password, displayName });
    } catch (err) {
      // signUp throws an "Account created — check email" message when confirmation is on
      if (err.message?.startsWith("Account created")) setInfo(err.message);
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Field label="Your name">
        <Input autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Mridul Sehgal" />
      </Field>
      <Field label="Email">
        <Input type="email" autoCapitalize="none" autoCorrect="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </Field>
      <Field label="Password">
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6+ characters" />
      </Field>
      <Field label="Confirm password">
        <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="repeat password" />
      </Field>
      {error && <div className="text-sm text-red-600 mb-3 -mt-1">{error}</div>}
      {info && <div className="text-sm text-accent-700 bg-accent-50 rounded-lg p-2 mb-3 -mt-1">{info}</div>}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
    </form>
  );
}

function ResetPasswordForm({ onBack }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Enter your email");
    setLoading(true);
    try {
      await auth.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div>
        <div className="text-sm text-accent-700 bg-accent-50 rounded-lg p-3 mb-4">
          Check <strong>{email}</strong> for a password-reset link. Click it to set a new password.
        </div>
        <Button type="button" className="w-full" onClick={onBack}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <Field label="Email">
        <Input
          autoFocus
          type="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>
      {error && <div className="text-sm text-red-600 mb-3 -mt-1">{error}</div>}
      <Button type="submit" className="w-full mb-2" disabled={loading}>
        {loading ? "Sending…" : "Send reset link"}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700 py-1"
      >Back to sign in</button>
    </form>
  );
}

export function UpdatePasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setLoading(true);
    try {
      await auth.updatePassword(password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full max-w-md mx-auto px-5 pt-10 pb-12 flex flex-col">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent-600 flex items-center justify-center text-white font-bold text-lg">S</div>
        <div>
          <div className="font-bold text-xl leading-tight">Splitly</div>
          <div className="text-xs text-slate-500">Split bills with friends</div>
        </div>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
        <p className="text-sm text-slate-500 mt-1">Pick something you'll remember this time.</p>
      </div>
      <div className="bg-white rounded-2xl shadow-soft p-5">
        <form onSubmit={submit}>
          <Field label="New password">
            <PasswordInput autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6+ characters" />
          </Field>
          <Field label="Confirm password">
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="repeat password" />
          </Field>
          {error && <div className="text-sm text-red-600 mb-3 -mt-1">{error}</div>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Updating…" : "Update password"}</Button>
        </form>
      </div>
    </div>
  );
}
