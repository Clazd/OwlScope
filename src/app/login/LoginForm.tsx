"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/common/Button";

/**
 * Standalone login form that does not depend on the AppShell or any of the
 * authenticated-route components. It talks directly to /api/auth/login and
 * /api/auth/signup so a failing token never blocks the form from rendering.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        setError(body.error ?? "Authentication failed.");
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
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-[380px] border border-rule bg-surface p-6"
    >
      <h1 className="type-body-strong text-ink mb-1">OwlScope</h1>
      <p className="type-small text-ink-3 mb-6">
        {mode === "login" ? "Sign in to continue." : "Create your account."}
      </p>

      <div className="mb-4">
        <label className="type-small text-ink-3 mb-1 block" htmlFor="login-username">
          Username
        </label>
        <input
          id="login-username"
          type="text"
          autoComplete="username"
          required
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="type-data block w-full rounded-control border border-rule-strong bg-bg px-3 py-2 text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-ink"
          placeholder="your username"
        />
      </div>

      <div className="mb-4">
        <label className="type-small text-ink-3 mb-1 block" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="type-data block w-full rounded-control border border-rule-strong bg-bg px-3 py-2 text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-ink"
          placeholder="password"
        />
      </div>

      {error && (
        <p className="type-small text-unsupported mb-4">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy || !username.trim() || password.length < 6}
        className="type-body-strong w-full rounded-control border border-rule-strong bg-ink px-3 py-2 text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {busy ? (mode === "login" ? "Signing in" : "Creating account") : (mode === "login" ? "Sign in" : "Create account")}
      </button>

      <div className="mt-6 border-t border-rule pt-4 text-center">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="type-small text-ink-2 hover:text-ink"
        >
          {mode === "login"
            ? "Don't have an account? Create one."
            : "Already have an account? Sign in."}
        </button>
      </div>
    </form>
  );
}
