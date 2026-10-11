"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ErrorNote, Field, Input } from "@/components/ui/kit";
import { useAuth } from "@/lib/auth";

export function ChangePasswordForm() {
  const { changePassword, status, user } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "signed-out") router.replace("/login");
  }, [status, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("newPassword") !== f.get("confirm")) return setMismatch(true);
    setMismatch(false);
    setBusy(true);
    setError(null);
    try {
      await changePassword(String(f.get("currentPassword")), String(f.get("newPassword")));
      router.replace("/job-cards");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {user?.mustChangePassword && (
        <p className="rounded-control bg-signal-soft px-3 py-2 text-sm">Your admin gave you a temporary password. Choose your own to continue.</p>
      )}
      <Field label="Current password">{(id) => <Input id={id} name="currentPassword" type="password" autoComplete="current-password" required />}</Field>
      <Field label="New password" hint="At least 8 characters, with a letter and a number">
        {(id, d) => <Input id={id} name="newPassword" type="password" autoComplete="new-password" aria-describedby={d} required minLength={8} />}
      </Field>
      <Field label="Repeat new password" error={mismatch ? "The two passwords don’t match" : undefined}>
        {(id) => <Input id={id} name="confirm" type="password" autoComplete="new-password" aria-invalid={mismatch} required />}
      </Field>
      <ErrorNote error={error} />
      <Button tone="next" type="submit" busy={busy} className="mt-2 h-11">
        Change password
      </Button>
    </form>
  );
}
