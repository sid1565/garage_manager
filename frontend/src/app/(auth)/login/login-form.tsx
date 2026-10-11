"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ErrorNote, Field, Input } from "@/components/ui/kit";
import { useAuth } from "@/lib/auth";

export function LoginForm() {
  const { login, status } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/job-cards";
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "signed-in") router.replace(target);
  }, [status, router, target]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const user = await login(String(form.get("email")), String(form.get("password")));
      router.replace(user.mustChangePassword ? "/change-password" : target);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email">{(id) => <Input id={id} name="email" type="email" autoComplete="username" required />}</Field>
      <Field label="Password">{(id) => <Input id={id} name="password" type="password" autoComplete="current-password" required />}</Field>
      <ErrorNote error={error} />
      <Button tone="next" type="submit" busy={busy} className="mt-2 h-11">
        Sign in
      </Button>
      <p className="text-sm text-ink-soft">
        New garage?{" "}
        <Link href="/register" className="font-medium text-steel underline-offset-2 hover:underline">
          Set up your garage
        </Link>
      </p>
    </form>
  );
}
