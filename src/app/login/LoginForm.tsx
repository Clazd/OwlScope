"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Compute password strength for signup
  const getPasswordStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass) || /[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const strength = getPasswordStrength(password);
  const strengthLabels = ["Very weak", "Weak", "Fair", "Strong", "Excellent"];
  const strengthColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Authentication failed. Please check your credentials.");
        return;
      }

      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-[#1f242e] bg-[#0c0e12]/90 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300">
      {/* Top emerald glow line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#2ecc71] to-transparent opacity-80" />

      {/* Brand Header */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#232936] bg-[#141822] p-2 shadow-inner">
          <img
            src="/owlscope-logo.png"
            alt="OwlScope Logo"
            className="h-full w-full object-cover"
            style={{ borderRadius: 10 }}
          />
          <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#0c0e12] p-0.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#2ecc71] shadow-[0_0_8px_#2ecc71]" />
          </div>
        </div>

        <h1 className="text-xl font-bold tracking-tight text-[#f4f6fa]">
          OwlScope
        </h1>
        <p className="mt-1 text-xs tracking-wider uppercase text-[#2ecc71] font-semibold">
          AI Writing Office · Cloud Sync
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-[#1f242e] bg-[#12151c] p-1">
        <button
          type="button"
          onClick={() => { setMode("login"); setError(null); }}
          className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-all ${
            mode === "login"
              ? "bg-[#1f2533] text-[#f4f6fa] shadow-sm"
              : "text-[#8a94a6] hover:text-[#f4f6fa]"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
          Sign In
        </button>
        <button
          type="button"
          onClick={() => { setMode("signup"); setError(null); }}
          className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-all ${
            mode === "signup"
              ? "bg-[#1f2533] text-[#f4f6fa] shadow-sm"
              : "text-[#8a94a6] hover:text-[#f4f6fa]"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Create Account
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Username Field */}
        <div>
          <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#a0aec0]" htmlFor="login-username">
            <span>Username</span>
            <span className="text-[10px] text-[#556075]">no email required</span>
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#556075]">
              <span className="text-sm font-bold font-mono">@</span>
            </div>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-[#232936] bg-[#141822] py-2.5 pl-8 pr-3 font-mono text-sm text-[#f4f6fa] placeholder-[#454e60] transition-all focus:border-[#2ecc71] focus:bg-[#161b26] focus:outline-none focus:ring-1 focus:ring-[#2ecc71]"
              placeholder="writer"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#a0aec0]">
            <label htmlFor="login-password">Password</label>
            {mode === "login" && (
              <span className="text-[10px] text-[#556075]">min 6 characters</span>
            )}
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#556075]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#232936] bg-[#141822] py-2.5 pl-9 pr-10 font-mono text-sm text-[#f4f6fa] placeholder-[#454e60] transition-all focus:border-[#2ecc71] focus:bg-[#161b26] focus:outline-none focus:ring-1 focus:ring-[#2ecc71]"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#556075] hover:text-[#a0aec0] transition-colors"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>

          {/* Password strength bar for signup */}
          {mode === "signup" && password.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#6c788d]">Strength:</span>
                <span style={{ color: strengthColors[strength] || "#6c788d" }} className="font-semibold">
                  {strengthLabels[strength] || "Too short"}
                </span>
              </div>
              <div className="flex gap-1 h-1.5 w-full bg-[#181d28] rounded-full overflow-hidden">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className="h-full flex-1 transition-all duration-300 rounded-full"
                    style={{
                      backgroundColor: strength >= step ? strengthColors[strength] : "#232936"
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="flex-1">{error}</p>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={busy || !username.trim() || password.length < 6}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-[#2ecc71] py-2.5 px-4 font-semibold text-xs uppercase tracking-wider text-[#0c0e12] shadow-lg transition-all duration-200 hover:bg-[#34d399] hover:shadow-[#2ecc71]/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <>
              <svg className="h-4 w-4 animate-spin text-[#0c0e12]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>{mode === "login" ? "Signing In..." : "Creating Account..."}</span>
            </>
          ) : (
            <>
              <span>{mode === "login" ? "Enter Writing Office" : "Create My Account"}</span>
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </>
          )}
        </button>
      </form>

      {/* Footer Feature Badges */}
      <div className="mt-6 border-t border-[#1c212c] pt-4 text-center">
        <div className="flex items-center justify-center gap-3 text-[11px] text-[#6c788d]">
          <span className="flex items-center gap-1">
            <svg className="h-3 w-3 text-[#2ecc71]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Protected Auth
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <svg className="h-3 w-3 text-[#2ecc71]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            Supabase DB
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <svg className="h-3 w-3 text-[#2ecc71]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Mobile Ready
          </span>
        </div>
      </div>
    </div>
  );
}
