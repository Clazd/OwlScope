import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "OwlScope - Login",
  description: "Sign in to your OwlScope writing office.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <LoginForm />
    </div>
  );
}
