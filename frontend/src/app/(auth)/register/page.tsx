import type { Metadata } from "next";
import { AuthFrame } from "@/components/shell/auth-frame";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Set up your garage" };

export default function RegisterPage() {
  return (
    <AuthFrame title="Set up your garage" sub="You’ll be the garage admin. Add your team after this.">
      <RegisterForm />
    </AuthFrame>
  );
}
