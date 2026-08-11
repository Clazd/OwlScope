import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "OwlScope - Login",
  description: "Sign in to your OwlScope writing office.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Suspense fallback={<div className="type-small text-ink-3">Loading login form...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
