import type { Metadata } from "next";
import { AuthFrame } from "@/components/shell/auth-frame";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordPage() {
  return (
    <AuthFrame title="Change password" sub="This signs you out on your other devices.">
      <ChangePasswordForm />
    </AuthFrame>
  );
}
