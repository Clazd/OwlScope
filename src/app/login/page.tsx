import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "OwlScope - Sign In",
  description: "Sign in to your private OwlScope AI writing office and cloud workspace.",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07090c] px-4 py-12">
      {/* Ambient background glow & radial highlights */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[550px] w-[550px] -translate-x-1/2 rounded-full opacity-20 blur-[130px]"
        style={{
          background: "radial-gradient(circle, rgba(46, 204, 113, 0.8) 0%, rgba(16, 185, 129, 0.2) 60%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 left-1/3 h-[450px] w-[450px] rounded-full opacity-10 blur-[120px]"
        style={{
          background: "radial-gradient(circle, rgba(59, 130, 246, 0.6) 0%, transparent 80%)",
        }}
      />

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      />

      {/* Main card */}
      <Suspense
        fallback={
          <div className="flex h-[420px] w-[440px] items-center justify-center rounded-2xl border border-[#1f242e] bg-[#0c0e12]/90">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2ecc71] border-t-transparent" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
