import { useState } from "react";
import { auth } from "./store";
import { Button, Field, Input } from "./components";

export function LoginScreen() {
  const [mode, setMode] = useState("signin");
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
        <h1 className="text-2xl font-bold tracking-tight">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {mode === "signin" ? "Sign in to your Splitly account." : "Email and a password — that's it."}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-5">
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
        {mode === "signin" ? <SignInForm /> : <SignUpForm />}
      </div>

      <p className="text-[11px] text-slate-400 text-center mt-6 leading-relaxed">
        Backed by Supabase Auth. Your data is private to your account (Postgres Row-Level Security).
      </p>
    </div>
  );
}

function SignInForm() {
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
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </Field>
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
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6+ characters" />
      </Field>
      <Field label="Confirm password">
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="repeat password" />
      </Field>
      {error && <div className="text-sm text-red-600 mb-3 -mt-1">{error}</div>}
      {info && <div className="text-sm text-accent-700 bg-accent-50 rounded-lg p-2 mb-3 -mt-1">{info}</div>}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
    </form>
  );
}
