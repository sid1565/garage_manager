import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/shell/auth-frame";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthFrame title="Sign in" sub="Use the email your garage admin set up for you.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
